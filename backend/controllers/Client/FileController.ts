import type { Controller, Http } from "xpresser/types/http";
import type { ObjectId } from "xpress-mongo";
import File, { FileDataType } from "../../models/File";
import Folder, { FolderDataType } from "../../models/Folder";
import Content, { ContentDataType } from "../../models/Content";
import { Owns3Error, owns3ForUser, previewKeyFor, previewUrl } from "../../lib/Owns3";
import { destroyFile, FILE_CLIP_CONTEXT } from "../../lib/Files";
import { oc_fileSizeToString } from "../../functions";
import { escapeRegexp } from "xpress-mongo/fn/helpers";
import { oc_nanoidStripped } from "../../functions/string.fn";
import slugify from "slugify";

const UPLOAD_URL_TTL = 3600;
const DOWNLOAD_URL_TTL = 3600;

function owns3Error(http: Http, e: any) {
    if (e instanceof Owns3Error) return http.error(e.message, e.status);
    throw e;
}

/**
 * FileController
 * Files live on the user's own owns3 server. Flow:
 *   1. POST files/upload      -> presigned PUT url
 *   2. client PUTs the bytes   -> straight to S3
 *   3. POST file/:file/confirm -> we verify with owns3 and create the file clip
 */
export = <Controller.Object<{ authId: ObjectId; file: File }>>{
    name: "Client/FileController",

    e: (http: Http, error: string) => http.status(401).json({ error }),

    middlewares: {
        Abolish: ["upload"]
    },

    /**
     * @openapi
     * /client/v1/files:
     *   get:
     *     tags: [Files]
     *     summary: List files
     *     description: |
     *       Every uploaded file of the user, newest first. Optional `folder` and `type` filters,
     *       where `type` matches the start of the content type, so `image` returns every image
     *       and `image/png` only PNGs.
     *
     *       When the user's owns3 app has preview links enabled, the response carries a `preview`
     *       block with the rotating key's base url and expiry, and every file gets a `previewUrl`
     *       that needs no authentication and can go straight into an `img` or `video` tag. The key
     *       rotates, so refresh the listing at `preview.expiresAt`. Files of 99 MB or more are not
     *       served this way.
     *
     *       `preview` is null when preview links are disabled for the app, when the user has no
     *       storage connected, or when their default storage needs a Pro plan. Fall back to
     *       `GET /client/v1/file/{file}/url` for a presigned url in that case.
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
     *       - { in: query, name: perPage, schema: { type: integer, minimum: 1, maximum: 1000, default: 30 } }
     *       - { in: query, name: folder, schema: { type: string }, description: Folder slug. }
     *       - { in: query, name: type, schema: { type: string }, description: "Content type prefix, e.g. `image`." }
     *     responses:
     *       200:
     *         description: A page of files.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/FileListResponse" }
     *       401:
     *         description: Missing or invalid `oc-token`.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * List the user's uploaded files, with preview urls when owns3 offers them.
     */
    async all(http, { authId: userId }) {
        const { page, perPage } = http.paginationQuery();
        const folder = http.query("folder", undefined) as unknown;
        const type = http.query("type", undefined) as unknown;

        const query: Record<string, any> = { userId, status: "uploaded" };

        if (typeof folder === "string" && folder.length) {
            query.folder = slugify(folder, { lower: true, replacement: "-" });
        }

        // `image` matches image/*, `image/png` only that type.
        if (typeof type === "string" && type.length) {
            query.contentType = new RegExp("^" + escapeRegexp(type), "i");
        }

        const files = await File.paginate<FileDataType>(page, perPage, query, {
            sort: { uploadedAt: -1, createdAt: -1 }
        });

        // Public preview urls, when the user's owns3 app has them enabled.
        let preview: { baseUrl: string; expiresAt: string; ttlMinutes: number } | null = null;

        if (files.data.length) {
            const owns3 = await owns3ForUser(userId);

            if (owns3) {
                try {
                    const key = await previewKeyFor(owns3, `${owns3.endpoint}|${userId}`);

                    if (key) {
                        preview = {
                            baseUrl: key.baseUrl,
                            expiresAt: key.expiresAt,
                            ttlMinutes: key.ttlMinutes
                        };

                        for (const file of files.data) {
                            (file as any).previewUrl = previewUrl(key, file.path);
                        }
                    }
                } catch (e) {
                    // A preview key is a nice-to-have: never fail the listing over it.
                    console.error("[files] preview key:", (e as Error).message);
                }
            }
        }

        return {
            files: {
                ...files,
                data: files.data.map((f) => ({
                    publicId: f.publicId,
                    name: f.name,
                    title: f.title,
                    ext: f.ext,
                    folder: f.folder,
                    size: f.size,
                    contentType: f.contentType,
                    status: f.status,
                    createdAt: f.createdAt,
                    uploadedAt: f.uploadedAt,
                    previewUrl: (f as any).previewUrl
                }))
            },
            preview
        };
    },

    /**
     * @openapi
     * /client/v1/files/upload:
     *   post:
     *     tags: [Files]
     *     summary: Request an upload slot
     *     description: |
     *       Step 1 of 3. Requires a connected owns3 server. Creates a pending file record and
     *       returns a presigned url. Step 2: `PUT` the raw file body to `upload.url` with the returned
     *       headers (no api key needed). Step 3: call confirm. Encrypted folders are refused.
     *       The clip's title is `title` when given, otherwise the file name; its content is always "File Clip".
     *     security: [{ ocToken: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/FileUploadBody" }
     *           example: { name: photo.jpg, title: Holiday photo, contentType: image/jpeg, size: 204800, folder: clipboard }
     *     responses:
     *       200:
     *         description: Upload slot.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/FileUploadResponse" }
     *       400:
     *         description: No owns3 server connected, validation error, or encrypted folder.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       404:
     *         description: Folder not found.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       502:
     *         description: owns3 could not be reached or refused the request.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Request an upload slot.
     */
    async upload(http, { authId: userId }) {
        type body = { name: string; title?: string; contentType?: string; size?: number; folder: string };
        const { name, title, contentType, size, folder } = http.validatedBody<body>();

        const owns3 = await owns3ForUser(userId);
        if (!owns3) return http.badRequestError("Connect an owns3 server before uploading files.");

        const $folder = await Folder.findOne(<FolderDataType>{
            userId,
            slug: slugify(folder, { lower: true, replacement: "-" })
        });
        if (!$folder) return http.error(`No folder with name: '${folder}'`, 404);
        if ($folder.isEncrypted()) return http.badRequestError("Files cannot be uploaded into an encrypted folder.");

        // Object key on owns3 is random: <userId>/<fileId>.<ext>. The real name only lives in our records.
        const publicId = oc_nanoidStripped(21);
        const ext = File.extensionOf(name);
        const path = `${http.authData().publicId}/${publicId}${ext ? `.${ext}` : ""}`;

        const file = File.make(<Partial<FileDataType>>{
            publicId,
            userId,
            folder: $folder.data.slug,
            name: name.trim(),
            title: (title ?? "").trim() || name.trim(),
            ext,
            path,
            size: size ?? 0,
            contentType: contentType || "application/octet-stream",
            status: "pending"
        });

        let presigned;
        try {
            presigned = await owns3.presignUpload(path, UPLOAD_URL_TTL);
        } catch (e) {
            return owns3Error(http, e);
        }

        await file.save();

        return {
            file: file.getPublicFields(),
            upload: {
                method: presigned.method,
                url: presigned.url,
                expiresIn: presigned.expiresIn,
                headers: { "Content-Type": file.data.contentType }
            }
        };
    },

    /**
     * @openapi
     * /client/v1/file/{file}/confirm:
     *   post:
     *     tags: [Files]
     *     summary: Confirm an upload
     *     description: |
     *       Step 3 of 3. Verifies the object exists on owns3, records its real size and type, and
     *       creates a clip of type `file` (content "File Clip") whose `file` field holds the file id and extension. Calling it again
     *       returns the existing clip with `info`.
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: file, required: true, schema: { type: string }, description: File publicId. }
     *     responses:
     *       200:
     *         description: File confirmed and clip created.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/FileConfirmResponse" }
     *       400:
     *         description: Not uploaded yet, no owns3 server connected, or the folder no longer exists.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       404:
     *         description: File not found.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Confirm the client finished uploading: verify on owns3, create the clip.
     */
    async confirm(http, { authId: userId, file }) {
        if (file.data.status === "uploaded" && file.data.clipId) {
            const clip = await Content.findById(file.data.clipId);
            return { file: file.getPublicFields(), clip: clip?.getPublicFields(), info: "File already confirmed." };
        }

        const owns3 = await owns3ForUser(userId);
        if (!owns3) return http.badRequestError("Connect an owns3 server before confirming uploads.");

        let stat;
        try {
            stat = await owns3.describe(file.data.path);
        } catch (e: any) {
            return owns3Error(http, e);
        }

        if (!stat) return http.badRequestError("The file has not been uploaded yet.");

        const folder = await Folder.findOne(<FolderDataType>{ userId, slug: file.data.folder });
        if (!folder) return http.badRequestError(`Folder '${file.data.folder}' no longer exists.`);

        file.data.size = stat.size;
        if (stat.contentType) file.data.contentType = stat.contentType;
        file.data.etag = stat.etag;
        file.data.status = "uploaded";
        file.data.uploadedAt = new Date();

        const clip = Content.make(<ContentDataType>{
            userId,
            title: file.data.title || file.data.name,
            context: FILE_CLIP_CONTEXT,
            type: "file",
            folder: folder.data.slug,
            size: { bytes: stat.size, human: oc_fileSizeToString(stat.size) },
            fileId: file.id(),
            file: file.summary()
        });

        await clip.save();

        file.data.clipId = clip.id();
        await file.save();

        return { file: file.getPublicFields(), clip: clip.getPublicFields(), message: "File uploaded." };
    },

    /**
     * @openapi
     * /client/v1/file/{file}/url:
     *   get:
     *     tags: [Files]
     *     summary: Temporary download url
     *     description: Presigned url valid for one hour, fetched directly from the user's storage without an api key.
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: file, required: true, schema: { type: string }, description: File publicId. }
     *     responses:
     *       200:
     *         description: Download url.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/FileUrlResponse" }
     *       400:
     *         description: Not uploaded yet or no owns3 server connected.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       404:
     *         description: File not found.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Temporary download url.
     */
    async url(http, { authId: userId, file }) {
        if (file.data.status !== "uploaded") return http.badRequestError("The file has not been uploaded yet.");

        const owns3 = await owns3ForUser(userId);
        if (!owns3) return http.badRequestError("Connect your owns3 server to download files.");

        try {
            const presigned = await owns3.presignDownload(file.data.path, DOWNLOAD_URL_TTL);
            return { url: presigned.url, method: presigned.method, expiresIn: presigned.expiresIn };
        } catch (e) {
            return owns3Error(http, e);
        }
    },

    /**
     * @openapi
     * /client/v1/file/{file}/delete:
     *   post:
     *     tags: [Files]
     *     summary: Delete a file
     *     description: Deletes the object on owns3, the file record and its clip. Deleting a file clip through the clip delete endpoint does the same.
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: file, required: true, schema: { type: string }, description: File publicId. }
     *     responses:
     *       200:
     *         description: Deleted.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/MessageResponse" }
     *       400:
     *         description: No owns3 server connected.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       404:
     *         description: File not found.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Delete a file: the object on owns3, its record and its clip.
     */
    async delete(http, { authId: userId, file }) {
        const owns3 = await owns3ForUser(userId);
        if (!owns3) return http.badRequestError("Connect your owns3 server to delete files.");

        try {
            await destroyFile(file, owns3);
        } catch (e) {
            return owns3Error(http, e);
        }

        return { message: "File deleted." };
    }
};
