import { Controller, Http } from "xpresser/types/http";
import Folder from "../../models/Folder";
import bcrypt from "bcryptjs";

/**
 * FolderController
 */
export = <Controller.Object<{ folder: Folder }>>{
    // Controller Name
    name: "FolderController",

    // Controller Default Error Handler.
    e: (http: Http, error: string) => http.status(401).json({ error }),

    middlewares: {
        Abolish: ["create", "setPassword", "checkPassword"]
    },

    /**
     * Get all folders
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

    /**
     * Create a new folder.
     * @param http
     */
    async create(http) {
        const userId = http.authUserId();
        const { name } = http.validatedBody();

        /**
         * Create folder.
         */
        const folder = await Folder.create({ userId, name });

        /**
         * Return folder.
         */
        return folder.getPublicFields();
    },

    /**
     * Set password for a folder.
     * @param http
     * @param folder
     */
    async setPassword(http, { folder }) {
        let { password } = http.validatedBody<{ password: string }>();

        /**
         * Save Encrypted hashed password
         */
        await folder.update({
            password: bcrypt.hashSync(password, 10),
            hasPassword: true
        });

        return { message: "Password set successfully." };
    },

    /**
     * Check if password is correct.
     * @param http
     * @param folder
     */
    checkPassword(http, { folder }) {
        if (!folder.data.password) return http.badRequestError("Folder has no password.");

        // Get password from request.
        const { password } = http.validatedBody<{ password: string }>();

        // Check if password is correct.
        return { match: folder.matchPassword(password) };
    }
};
