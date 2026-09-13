import { Controller, Http } from "xpresser/types/http";
import Folder, { FolderDataType } from "../../models/Folder";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid"
import Content from "../../models/Content";
import File from "../../models/File";
import { owns3ForUser } from "../../lib/Owns3";
import { destroyFile } from "../../lib/Files";

/**
 * FolderController
 */
export = <Controller.Object<{ folder: Folder }>>{
    // Controller Name
    name: "FolderController",

    // Controller Default Error Handler.
    e: (http: Http, error: string) => http.status(401).json({ error }),

    middlewares: {
        Abolish: ["create", "setPassword", "checkPassword"],
        "params.pasteId": "pasteId"
    },

    /**
     * @openapi
     * /client/v1/folders:
     *   get:
     *     tags: [Folders]
     *     summary: List folders
     *     description: All folders of the user with their clip counts.
     *     security: [{ ocToken: [] }]
     *     responses:
     *       200:
     *         description: Folders.
     *         content:
     *           application/json:
     *             schema:
     *               type: array
     *               items: { $ref: "#/components/schemas/Folder" }
     *       401:
     *         description: Missing or invalid `oc_token`.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *   post:
     *     tags: [Folders]
     *     summary: Create folder
     *     security: [{ ocToken: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/CreateFolderBody" }
     *           example: { name: Work }
     *     responses:
     *       200:
     *         description: Created folder.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/Folder" }
     *       400:
     *         description: Validation error or a folder with that name already exists.
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
     * @openapi
     * /client/v1/folder/{folder}/set-password:
     *   post:
     *     tags: [Folders]
     *     summary: Set folder password
     *     description: |
     *       Stores the password used to encrypt clips in this folder. The client must send the
     *       MD5 hash of the password, never the plain text. Folders with a password cannot be deleted.
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: folder, required: true, schema: { type: string }, description: Folder slug. }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/FolderPasswordBody" }
     *           example: { password: 5f4dcc3b5aa765d61d8327deb882cf99 }
     *     responses:
     *       200:
     *         description: Password set.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/MessageResponse" }
     *       400:
     *         description: Validation error.
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
     * @openapi
     * /client/v1/folder/{folder}/check-password:
     *   post:
     *     tags: [Folders]
     *     summary: Check folder password
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: folder, required: true, schema: { type: string }, description: Folder slug. }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/FolderPasswordBody" }
     *     responses:
     *       200:
     *         description: Comparison result.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/CheckFolderPasswordResponse" }
     *       400:
     *         description: Validation error or the folder has no password.
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
    },

    /**
     * @openapi
     * /client/v1/folder/{folder}/enable-public-paste:
     *   post:
     *     tags: [Folders]
     *     summary: Enable public paste
     *     description: Generates a public paste id so anyone can paste into this folder via `/client/v1/clips/paste/{pasteId}`.
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: folder, required: true, schema: { type: string }, description: Folder slug. }
     *     responses:
     *       200:
     *         description: Enabled.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/MessageResponse" }
     *       400:
     *         description: Already enabled.
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
     * Enable public paste.
     * @param http
     * @param folder
     */
    async enablePublicPaste(http, { folder }) {
        if (folder.has("publicPaste"))
            return http.badRequestError("Folder already has public paste enabled.");

        folder.set("publicPaste", <FolderDataType["publicPaste"]>{
            id: nanoid(),
            date: new Date()
        });

        await folder.save();

        return { message: "Public paste enabled." };
    },

    /**
     * @openapi
     * /client/v1/folder/{folder}/disable-public-paste:
     *   post:
     *     tags: [Folders]
     *     summary: Disable public paste
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: folder, required: true, schema: { type: string }, description: Folder slug. }
     *     responses:
     *       200:
     *         description: Disabled.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/MessageResponse" }
     *       400:
     *         description: Not enabled.
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
     * Disable public paste.
     * @param http
     * @param folder
     */
    async disablePublicPaste(http, { folder }) {
        if (!folder.has("publicPaste"))
            return http.badRequestError("Folder is not enabled for public paste.");

        await folder.unset("publicPaste");

        return { message: "Public paste disabled." };
    },

    /**
     * @openapi
     * /client/v1/folder/{folder}:
     *   delete:
     *     tags: [Folders]
     *     summary: Delete folder
     *     description: Deletes the folder and every clip in it. The default `clipboard` folder and folders with a password cannot be deleted.
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: folder, required: true, schema: { type: string }, description: Folder slug. }
     *     responses:
     *       200:
     *         description: Deleted.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/MessageResponse" }
     *       400:
     *         description: Folder is protected or is the default folder.
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
     * Delete a folder.
     */
    async delete(http, { folder }) {
        if (folder.has("hasPassword", true)) {
            return http.badRequestError("Folder has password, cannot delete.");
        } else if (folder.has("slug", "clipboard")) {
            return http.badRequestError(
                `Folder ${folder.data.name} cannot be deleted! It is the default folder.`
            );
        }

        // Files in this folder: delete their objects on owns3 first.
        const files = File.fromArray(
            await File.find({ userId: folder.data.userId, folder: folder.data.slug })
        );

        if (files.length) {
            const owns3 = await owns3ForUser(folder.data.userId);
            if (!owns3) {
                return http.badRequestError(
                    `Folder has ${files.length} file(s). Connect your owns3 server to delete it.`
                );
            }

            for (const file of files) await destroyFile(file, owns3);
        }

        await Content.native().deleteMany({
            folder: folder.data.slug,
            userId: folder.data.userId
        });

        await folder.delete();

        return { message: "Folder deleted successfully." };
    },

    /**
     * @openapi
     * /client/v1/folders/public/{pasteId}:
     *   get:
     *     tags: [Public]
     *     summary: Folder by public paste id
     *     description: No authentication required. Resolves a public paste id to its folder.
     *     parameters:
     *       - { in: path, name: pasteId, required: true, schema: { type: string } }
     *     responses:
     *       200:
     *         description: Folder.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/PublicFolderResponse" }
     *       400:
     *         description: Paste folder not found or has expired.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    async pasteId(http) {
        const folder = http.loadedParam<Folder>("folder");
        return { folder: folder.getPublicFields() };
    }
};
