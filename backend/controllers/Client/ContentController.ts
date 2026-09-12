import { Controller, Http } from "xpresser/types/http";
import Content, { ContentDataType } from "../../models/Content";
import type { ObjectId } from "xpress-mongo";
import { omitIdAndPick } from "xpress-mongo";
import Folder, { FolderDataType } from "../../models/Folder";
import { DefaultPaginationData, escapeRegexp } from "xpress-mongo/fn/helpers";
import { isString, isStringRequired } from "../../abolish/reusables";
import { skipIfUndefined } from "abolish/src/helpers";
import { oc_stringSize } from "../../functions";

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
        IsProUser: "update"
    },

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
            : await Content.findOne(<ContentDataType>{ userId, context, folder });

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

    async publicPaste(http) {
        const folder = http.loadedParam<Folder>("folder");
        type body = { title?: string; content: string };
        const { title, content: context } = http.validatedBody<body>();
        let updated = false;

        // set userId to folder owner id since  no auth user is required for this route.
        const commonFolderData = { userId: folder.data.userId, folder: folder.data.slug };

        // Check if content already exists if folder is not encrypted.
        let content = await Content.findOne(<ContentDataType>{
            context,
            ...commonFolderData
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

    async upload(http) {
        // Get current user
        const authId = http.authUserId();

        // Get content as file.
        const content = await http.file("content", {
            size: 5,
            // image only extensions
            extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp"]
        });

        // Handle file upload error.
        if (content.error()) return http.badRequestError(content.error()!.message);

        // Validate file body
        const [err, { title, folder }] = await http.validateAsync(content.body, {
            title: skipIfUndefined(isString),
            folder: ["default:clipboard", isStringRequired, { setAuthId: authId }, "FolderExists"]
        });

        // Handle validation error.
        if (err) return http.badRequestError(err.message);

        console.log({ title, folder });

        return { message: "Image uploaded successfully!", content };
    },

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

    async delete(http, { clip }) {
        if (clip.data.encrypted) {
            const folder = (await clip.folder())!;
            const { password } = http.validatedBody<{ password: string }>();

            if (!folder.matchPassword(password))
                return http.badRequestError(`Incorrect password for folder: ${folder.data.name}`);
        }

        await clip.delete();

        return { message: "Clip deleted successfully!" };
    }
};
