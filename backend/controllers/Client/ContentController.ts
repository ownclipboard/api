import { Controller, Http } from "xpresser/types/http";
import Content, { ContentDataType } from "../../models/Content";
import type { ObjectId } from "xpress-mongo";
import type Folder from "../../models/Folder";

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
        "params.folder": "clips"
    },

    /**
     * Paste
     * @param http - Current Http Instance
     * @param authId - AuthId from boot.
     */
    async paste(http, { authId }) {
        type body = { title?: string; content: string; folder?: string };
        const body = http.validatedBody<body>();
        const folder = body.folder || "clipboard";

        // Check if content already exists
        let content = await Content.findOne(<ContentDataType>{
            userId: authId,
            context: body.content,
            folder
        });

        // If content already exists, update updateAt date.
        if (content) {
            await content.update(<ContentDataType>{ updatedAt: new Date() });
        } else {
            let type: ContentDataType["type"] = "text";

            if (http.abolish.test(body.content, "url")) {
                type = "url";
            }

            content = await Content.new(<ContentDataType>{
                type,
                userId: authId,
                title: body.title,
                context: body.content,
                folder
            });
        }

        return { content: content.getPublicFields() };
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

        const clips = await Content.find(
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

        if (!clip.hasChanges()) return { info: "Clip has no changes" };

        if (others.encrypted && !clip.data.encrypted) {
            const folder = await clip.folder();

            if (!folder?.isEncrypted()) {
                return { warning: "Clip does not belong to an encrypted folder" };
            }
        }

        await clip.save();

        return { message: "Clip updated successfully!" };
    }
};
