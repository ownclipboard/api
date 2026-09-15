import { Controller, Http } from "xpresser/types/http";
import Content, { ContentDataType } from "../../models/Content";
import type { ObjectId } from "xpress-mongo";
import { omitIdAndPick } from "xpress-mongo";
import Folder, { FolderDataType } from "../../models/Folder";
import { DefaultPaginationData, escapeRegexp } from "xpress-mongo/fn/helpers";
import { oc_stringSize } from "../../functions";
import { oc_uniqueStringArray } from "../../functions/string.fn";
import slugify from "slugify";
import File from "../../models/File";
import { Owns3Error, owns3ForUser } from "../../lib/Owns3";
import { destroyFile } from "../../lib/Files";

type TransferSkipReason = "not_found" | "encrypted" | "same_folder" | "file";

/**
 * Copy or move clips into another folder.
 *
 * Rules:
 *  - target folder must belong to the user and must not be encrypted
 *  - clips in encrypted folders are skipped (their content is ciphertext)
 *  - clips already in the target folder are skipped
 *  - file clips cannot be copied (owns3 has no server-side copy), only moved
 *  - if the target already has a clip with identical content, it is merged:
 *    the existing clip is touched and, on move, the source is deleted
 */
async function transferClips(http: Http, userId: ObjectId, mode: "copy" | "move") {
    const { ids, folder } = http.validatedBody<{ ids: string[]; folder: string }>();
    const verb = mode === "copy" ? "copied" : "moved";

    const target = await Folder.findOne(<FolderDataType>{
        userId,
        slug: slugify(folder, { lower: true, replacement: "-" })
    });

    if (!target) return http.error(`No folder with name: '${folder}'`, 404);
    if (target.isEncrypted()) {
        return http.badRequestError(`Clips cannot be ${verb} into an encrypted folder.`);
    }

    const uniqueIds = oc_uniqueStringArray(ids);
    const clips = Content.fromArray(
        await Content.find<ContentDataType>({ userId, publicId: { $in: uniqueIds } })
    );
    const byId = new Map(clips.map((c) => [c.data.publicId, c]));

    // Source folders, to detect clips living in encrypted folders.
    const sourceSlugs = oc_uniqueStringArray(clips.map((c) => c.data.folder));
    const encryptedFolders = new Set(
        (
            await Folder.find<FolderDataType>(
                { userId, slug: { $in: sourceSlugs }, visibility: "encrypted" },
                { projection: { slug: 1 } }
            )
        ).map((f) => f.slug)
    );

    const done: Array<{ id: string; copyId?: string }> = [];
    const merged: string[] = [];
    const skipped: Array<{ id: string; reason: TransferSkipReason }> = [];

    for (const id of uniqueIds) {
        const clip = byId.get(id);

        if (!clip) {
            skipped.push({ id, reason: "not_found" });
            continue;
        }

        if (clip.data.encrypted || encryptedFolders.has(clip.data.folder)) {
            skipped.push({ id, reason: "encrypted" });
            continue;
        }

        if (clip.data.folder === target.data.slug) {
            skipped.push({ id, reason: "same_folder" });
            continue;
        }

        if (mode === "copy" && clip.isFile()) {
            skipped.push({ id, reason: "file" });
            continue;
        }

        // Merge with an identical clip already in the target folder (file clips never merge).
        const existing = clip.isFile()
            ? null
            : await Content.findOne({
                  userId,
                  folder: target.data.slug,
                  context: clip.data.context,
                  fileId: { $exists: false }
              });

        if (existing) {
            existing.data.updatedAt = new Date();
            await existing.save();

            if (mode === "move") await clip.delete();

            merged.push(id);
            continue;
        }

        if (mode === "copy") {
            const copy = Content.make(<ContentDataType>{
                userId,
                title: clip.data.title,
                context: clip.data.context,
                type: clip.data.type,
                size: clip.data.size,
                folder: target.data.slug
            });

            await copy.save();
            done.push({ id, copyId: copy.data.publicId });
        } else {
            clip.data.folder = target.data.slug;
            clip.data.updatedAt = new Date();
            await clip.save();
            done.push({ id });
        }
    }

    return {
        folder: target.data.slug,
        [verb]: done,
        merged,
        skipped,
        message: `${done.length + merged.length} clip(s) ${verb} to '${target.data.name}'.`
    };
}

/**
 * ContentController
 */
export = <Controller.Object<{ authId: ObjectId; clip: Content }>>{
    // Controller Name
    name: "Client/ContentController",

    // Controller Default Error Handler.
    e: (http: Http, error: string) => http.status(401).json({ error }),

    middlewares: {
        // Use Abolish to validate all request body.
        Abolish: "*",
        "params.folder": "clips",
        "params.pasteId": "publicPaste",
        // Pro only routes
        IsProUser: ["update", "copy"]
    },

    /**
     * @openapi
     * /client/v1/clips/find:
     *   post:
     *     tags: [Public]
     *     summary: Find public-paste clips by id
     *     description: |
     *       No authentication required. Returns clips that were created through public paste,
     *       looked up by their ids. Meant for the paster to see the clips they submitted.
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/FindClipsBody" }
     *     parameters:
     *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
     *       - { in: query, name: perPage, schema: { type: integer, minimum: 1, maximum: 1000, default: 30 } }
     *     responses:
     *       200:
     *         description: Matching clips, newest first. Empty page when `ids` is empty.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/FindClipsResponse" }
     *       400:
     *         description: Validation error.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Find contents by publicId with public paste id
     * @param http
     */
    async find(http) {
        // Get ids from request body
        const { ids } = http.validatedBody<{ ids: string[] }>();

        // Get pagination data
        const { page, perPage } = http.paginationQuery();

        // return empty pagination data if no ids
        if (!ids || !ids.length) {
            return { clips: DefaultPaginationData({ page, perPage }) };
        }

        // find clips by ids
        const clips = await Content.paginate(
            page,
            perPage,
            { publicId: { $in: ids }, publicPaste: { $exists: true } },
            { projection: Content.projectPublicFields(), sort: { updatedAt: -1 } }
        );

        // return clips
        return { clips };
    },

    /**
     * @openapi
     * /client/v1/clips/paste:
     *   post:
     *     tags: [Clips]
     *     summary: Paste a clip
     *     description: |
     *       Creates a clip in a folder. In non-encrypted folders identical content is de-duplicated:
     *       the existing clip's `updatedAt` is touched instead of creating a new one.
     *       Clips pasted into an encrypted folder are stored as-is and flagged `encrypted`, so the
     *       client must encrypt the content before sending it.
     *     security: [{ ocToken: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/PasteBody" }
     *           example: { title: Groceries, content: 'milk, eggs', folder: clipboard }
     *     responses:
     *       200:
     *         description: The created or touched clip.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/PasteResponse" }
     *       400:
     *         description: Validation error or unknown folder.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       401:
     *         description: Missing or invalid `oc_token`.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Paste
     * @param http - Current Http Instance
     * @param authId - AuthId from boot.
     */
    async paste(http, { authId: userId }) {
        type body = { title?: string; content: string; folder?: string };
        const { title, content: context, folder } = http.validatedBody<body>();

        // Find Folder
        const $folder = (await Folder.findOne(<FolderDataType>{ slug: folder, userId }, {
            projection: omitIdAndPick("visibility")
        }))!;

        // Check if content already exists if folder is not encrypted.
        let content = $folder.isEncrypted()
            ? null
            : await Content.findOne({ userId, context, folder, fileId: { $exists: false } });

        // If content already exists, update updateAt date.
        if (content) {
            content.data.updatedAt = new Date();
        } else {
            // If content doesn't exists, make new content.
            content = Content.make(<ContentDataType>{
                userId,
                title,
                context,
                folder
            });

            // if folder is encrypted, set content as encrypted.
            if ($folder.isEncrypted()) {
                content.data.encrypted = true;
            } else {
                // Set default content type
                content.setContextType();
            }
        }

        // Set content size
        content.data.size = oc_stringSize(content.data.context);

        // Save content
        await content.save();

        // Return public fields
        return { clip: content.getPublicFields() };
    },

    /**
     * @openapi
     * /client/v1/clips/paste/{pasteId}:
     *   post:
     *     tags: [Public]
     *     summary: Paste into a shared folder
     *     description: |
     *       No authentication required. Pastes into the folder that owns `pasteId`
     *       (see enable public paste). Identical content is de-duplicated.
     *     parameters:
     *       - { in: path, name: pasteId, required: true, schema: { type: string } }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/PublicPasteBody" }
     *     responses:
     *       200:
     *         description: The created or existing clip.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/PublicPasteResponse" }
     *       400:
     *         description: Validation error, or paste folder not found / expired.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    async publicPaste(http) {
        const folder = http.loadedParam<Folder>("folder");
        type body = { title?: string; content: string };
        const { title, content: context } = http.validatedBody<body>();
        let updated = false;

        // set userId to folder owner id since  no auth user is required for this route.
        const commonFolderData = { userId: folder.data.userId, folder: folder.data.slug };

        // Check if content already exists if folder is not encrypted.
        let content = await Content.findOne({
            context,
            ...commonFolderData,
            fileId: { $exists: false }
        });

        // If content already exists, update updateAt date.
        if (content) {
            updated = true;
            content.data.updatedAt = new Date();
        } else {
            // If content doesn't exists, make new content.
            content = Content.make(<ContentDataType>{
                title,
                context,
                ...commonFolderData,
                publicPaste: true
            });

            // Set default content type
            content.setContextType();
        }

        // Set content size
        content.data.size = oc_stringSize(content.data.context);

        await content.save();

        // Return public fields
        return {
            clip: content.getPublicFields(),
            [updated ? "info" : "message"]: updated
                ? "Clip already exists!"
                : "Clip pasted successfully."
        };
    },

    /**
     * @openapi
     * /client/v1/clips:
     *   get:
     *     tags: [Clips]
     *     summary: List clips in the default folder
     *     description: Same as `/client/v1/clips/{folder}` with `folder` = `clipboard`.
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
     *       - { in: query, name: perPage, schema: { type: integer, minimum: 1, maximum: 1000, default: 30 } }
     *     responses:
     *       200:
     *         description: Clips, newest first.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ClipsListResponse" }
     *       401:
     *         description: Missing or invalid `oc_token`.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     * /client/v1/clips/{folder}:
     *   get:
     *     tags: [Clips]
     *     summary: List clips in a folder
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: folder, required: true, schema: { type: string }, description: Folder slug. }
     *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
     *       - { in: query, name: perPage, schema: { type: integer, minimum: 1, maximum: 1000, default: 30 } }
     *     responses:
     *       200:
     *         description: Clips, newest first. `info` warns when an encrypted folder has no password yet.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ClipsListResponse" }
     *       401:
     *         description: Missing or invalid `oc_token`.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       404:
     *         description: Folder not found.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Get all clips by folder
     * @param http
     * @param authId
     */
    async clips(http, { authId }) {
        const folder = http.params.folder as string;
        let info!: string;

        if (http.hasLoadedParam("folder")) {
            const $folder = http.loadedParam<Folder>("folder");

            // Throw info if folder is encrypted and not hasPassword.
            if ($folder.data.visibility === "encrypted" && !$folder.data.hasPassword) {
                info = `Folder: "${folder}" does not have an encrypted password set yet!`;
            }
        }

        const { page, perPage } = http.paginationQuery();

        const clips = await Content.paginate(
            page,
            perPage,
            <ContentDataType>{
                userId: authId,
                folder: folder || "clipboard"
            },
            {
                projection: Content.projectPublicFields(),
                sort: { updatedAt: -1 }
            }
        );

        return {
            clips,
            info
        };
    },

    /**
     * @openapi
     * /client/v1/clips/copy:
     *   post:
     *     tags: [Clips]
     *     summary: Copy clips into another folder (Pro)
     *     description: |
     *       Copies up to 100 clips into a folder. Requires an active Pro subscription.
     *
     *       - The target folder must belong to the user and must not be encrypted.
     *       - Clips in encrypted folders are skipped (`encrypted`).
     *       - Clips already in the target folder are skipped (`same_folder`).
     *       - File clips are skipped (`file`): owns3 has no server-side copy. Move them instead.
     *       - If the target already holds a clip with identical content it is merged:
     *         the existing clip is touched instead of creating a duplicate.
     *     security: [{ ocToken: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/TransferClipsBody" }
     *           example: { ids: [AMtJUhUOdQRACyd7wyiq3], folder: work }
     *     responses:
     *       200:
     *         description: Per-clip results. Skipped ids do not fail the request.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/CopyClipsResponse" }
     *       400:
     *         description: Validation error, unknown folder, or encrypted target folder.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       403:
     *         description: Not a Pro user.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Copy clips into another folder. (Pro)
     * Body: { ids: string[], folder: string }
     */
    copy(http, { authId }) {
        return transferClips(http, authId, "copy");
    },

    /**
     * @openapi
     * /client/v1/clips/move:
     *   post:
     *     tags: [Clips]
     *     summary: Move clips into another folder
     *     description: |
     *       Moves up to 100 clips into a folder.
     *
     *       - The target folder must belong to the user and must not be encrypted.
     *       - Clips in encrypted folders are skipped (`encrypted`).
     *       - Clips already in the target folder are skipped (`same_folder`).
     *       - If the target already holds a clip with identical content it is merged:
     *         the existing clip is touched and the source clip is deleted.
     *     security: [{ ocToken: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/TransferClipsBody" }
     *           example: { ids: [AMtJUhUOdQRACyd7wyiq3, oipWNu2PQkyhVq9ztZ2tV], folder: work }
     *     responses:
     *       200:
     *         description: Per-clip results. Skipped ids do not fail the request.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/MoveClipsResponse" }
     *       400:
     *         description: Validation error, unknown folder, or encrypted target folder.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Move clips into another folder.
     * Body: { ids: string[], folder: string }
     */
    move(http, { authId }) {
        return transferClips(http, authId, "move");
    },

    /**
     * @openapi
     * /client/v1/clips/search:
     *   get:
     *     tags: [Clips]
     *     summary: Search clips
     *     description: |
     *       Case-insensitive substring search across the user's clips.
     *       `title` is searched on every clip; `content` only on clips that are not
     *       encrypted, because encrypted content is ciphertext.
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - in: query
     *         name: q
     *         required: true
     *         schema: { type: string, minLength: 1, maxLength: 200 }
     *         description: Text to search for. Treated literally, not as a regex.
     *       - in: query
     *         name: folder
     *         schema: { type: string }
     *         description: Restrict results to this folder slug.
     *       - in: query
     *         name: page
     *         schema: { type: integer, minimum: 1, default: 1 }
     *       - in: query
     *         name: perPage
     *         schema: { type: integer, minimum: 1, maximum: 1000, default: 30 }
     *     responses:
     *       200:
     *         description: Matching clips, newest first.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/SearchClipsResponse" }
     *       400:
     *         description: Missing or too long `q`.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Search clips.
     * Query: q (required), folder (optional), page, perPage
     *
     * Matches `title` on every clip, and `content` only on clips
     * that are not encrypted (encrypted content is ciphertext).
     */
    async search(http, { authId }) {
        const q = String(http.$query.get("q", "")).trim();
        const folder = http.$query.get<string | undefined>("folder");

        if (!q) return http.badRequestError("Query {q} is required!");
        if (q.length > 200) return http.badRequestError("Query {q} is too long. (Max. 200)");

        const { page, perPage } = http.paginationQuery();
        const regex = new RegExp(escapeRegexp(q), "i");

        const query: Record<string, any> = {
            userId: authId,
            $or: [
                // title is searchable for every clip
                { title: regex },
                // content is only searchable when not encrypted
                { encrypted: { $ne: true }, context: regex }
            ]
        };

        if (folder) query.folder = folder;

        const clips = await Content.paginate(page, perPage, query, {
            projection: Content.projectPublicFields(),
            sort: { updatedAt: -1 }
        });

        return { clips, query: q };
    },

    /**
     * @openapi
     * /client/v1/clip/{clip}/update:
     *   post:
     *     tags: [Clips]
     *     summary: Update a clip (Pro)
     *     description: Only `title` and `content` can be changed. Requires an active Pro subscription.
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: clip, required: true, schema: { type: string }, description: Clip publicId. }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/UpdateClipBody" }
     *           example: { title: New title }
     *     responses:
     *       200:
     *         description: Updated, or `info` when nothing changed.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/MessageResponse" }
     *       400:
     *         description: Validation error.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       403:
     *         description: Not a Pro user.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       404:
     *         description: Clip not found.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Update clip
     * @param http
     * @param authId
     * @param clip
     */
    async update(http, { authId, clip }) {
        // Only title and content are updatable; anything else in the body is ignored.
        const { title, content } = http.validatedBody<{ title?: string; content?: string }>();

        // Set only defined values
        clip.toCollection().setDefined(<ContentDataType>{ title, context: content });

        // Stop if clip has no changes
        if (!clip.hasChanges()) return { info: "Clip has no changes" };

        await clip.save();

        return { message: "Clip updated successfully!" };
    },

    /**
     * @openapi
     * /client/v1/clip/{clip}/delete:
     *   post:
     *     tags: [Clips]
     *     summary: Delete a clip
     *     description: Encrypted clips require the MD5 hash of their folder password in the body.
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: clip, required: true, schema: { type: string }, description: Clip publicId. }
     *     requestBody:
     *       required: false
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/DeleteClipBody" }
     *     responses:
     *       200:
     *         description: Deleted.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/MessageResponse" }
     *       400:
     *         description: Wrong folder password.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       404:
     *         description: Clip not found.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    async delete(http, { authId, clip }) {
        if (clip.data.encrypted) {
            const folder = (await clip.folder())!;
            const { password } = http.validatedBody<{ password: string }>();

            if (!folder.matchPassword(password))
                return http.badRequestError(`Incorrect password for folder: ${folder.data.name}`);
        }

        // File clips: remove the object from owns3 and the file record too.
        if (clip.isFile()) {
            const file = await File.findById(clip.data.fileId!);

            if (file) {
                const owns3 = await owns3ForUser(authId);
                if (!owns3) return http.badRequestError("Connect your owns3 server to delete files.");

                try {
                    await destroyFile(file, owns3);
                } catch (e: any) {
                    if (e instanceof Owns3Error) return http.error(e.message, e.status);
                    throw e;
                }

                return { message: "Clip deleted successfully!" };
            }
        }

        await clip.delete();

        return { message: "Clip deleted successfully!" };
    }
};
