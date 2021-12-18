import { Controller, Http } from "xpresser/types/http";
import Content, { ContentDataType } from "../../models/Content";
import type { ObjectId } from "xpress-mongo";

/**
 * ContentController
 */
export = <Controller.Object<{ authId: ObjectId }>>{
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

    async clips(http, { authId }) {
        const folder = http.params.folder as string;
        const params = http.loadedParams();

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
            clips
            // info: `Folder: "${folder}" does not have an encrypted password set yet!`
        };
    }
};
