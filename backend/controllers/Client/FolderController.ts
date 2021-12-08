import { Controller, Http } from "xpresser/types/http";
import Folder from "../../models/Folder";

/**
 * FolderController
 */
export = <Controller.Object>{
    // Controller Name
    name: "FolderController",

    // Controller Default Error Handler.
    e: (http: Http, error: string) => http.status(401).json({ error }),

    middlewares: {
        Abolish: ["create"]
    },

    /**
     * Example Action.
     * @param http - Current Http Instance
     */
    async all(http) {
        const userId = http.authUserId();

        /**
         * Return folders and count of contents.
         */
        return await Folder.native()
            .aggregate([
                { $match: { userId } },
                {
                    $lookup: {
                        from: "contents",
                        localField: "slug",
                        foreignField: "folder",
                        as: "contents"
                    }
                },
                { $addFields: { contents: { $size: "$contents" } } },
                { $project: Folder.projectPublicFields() }
            ])
            .toArray();
    },

    async create(http) {
        const userId = http.authUserId();
        const { name } = http.validatedBody();

        /**
         * Create folder.
         */
        const folder = await Folder.create(userId, name);

        /**
         * Return folder.
         */
        return folder.getPublicFields();
    }
};
