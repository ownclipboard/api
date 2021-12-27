import { Controller, Http } from "xpresser/types/http";
import Content, { ContentDataType } from "../../models/Content";
import type { ObjectId } from "xpress-mongo";
import { omitIdAndPick } from "xpress-mongo";
import Folder, { FolderDataType } from "../../models/Folder";

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
        "params.pasteId": "publicPaste"
    },

    find(http) {
        const body = http.validatedBody();
        return { clips: [], body };
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

        // Save content
        await content.save();

        // Return public fields
        return { clip: content.getPublicFields() };
    },

    async publicPaste(http) {
        const folder = http.loadedParam<Folder>("folder");
        type body = { title?: string; content: string };
        const { title, content: context } = http.validatedBody<body>();

        // set userId to folder owner id since  no auth user is required for this route.
        const commonFolderData = { userId: folder.data.userId, folder: folder.data.slug };

        // Check if content already exists if folder is not encrypted.
        let content = await Content.findOne(<ContentDataType>{
            context,
            ...commonFolderData
        });

        // If content already exists, update updateAt date.
        if (content) {
            content.data.updatedAt = new Date();
        } else {
            // If content doesn't exists, make new content.
            content = Content.make(<ContentDataType>{
                title,
                context,
                ...commonFolderData
            });

            // Set default content type
            content.setContextType();
        }

        await content.save();

        // Return public fields
        return { clip: content.getPublicFields() };
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
     * Update clip
     * @param http
     * @param authId
     * @param clip
     */
    async update(http, { authId, clip }) {
        const { content, ...others } =
            http.validatedBody<{ title?: string; encrypted?: boolean; content?: string }>();

        // Set only defined values
        clip.toCollection().setDefined(<ContentDataType>{ ...others, context: content });

        // Stop if clip has no changes
        if (!clip.hasChanges()) return { info: "Clip has no changes" };

        // Check if folder is encrypted and has password
        if (others.encrypted && !clip.data.encrypted) {
            const folder = await clip.folder();

            if (!folder?.isEncrypted()) {
                return { warning: "Clip does not belong to an encrypted folder" };
            }
        }

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
