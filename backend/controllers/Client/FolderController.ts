import { Controller, Http } from "xpresser/types/http";
import Folder, { FolderDataType } from "../../models/Folder";
import bcrypt from "bcryptjs";
import { Abolish } from "abolish";
import { nanoid } from "nanoid";
import slugify from "slugify";
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
        Abolish: ["create", "rename", "setPassword", "checkPassword"],
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
     *         description: Missing or invalid `oc-token`.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *   post:
     *     tags: [Folders]
     *     summary: Create folder
     *     description: |
     *       Creates a folder. Pass `visibility: encrypted` for a folder whose clips the client
     *       encrypts before sending. Visibility is fixed at creation and cannot be changed later,
     *       because existing clips would be marked encrypted without being encrypted.
     *       An encrypted folder needs a password before it is usable, set with
     *       `POST /client/v1/folder/{folder}/set-password`. Files cannot be uploaded into an
     *       encrypted folder, its clips cannot be copied or moved, and devices cannot use it.
     *     security: [{ ocToken: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/CreateFolderBody" }
     *           example: { name: Secrets, visibility: encrypted }
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
     *         description: Missing or invalid `oc-token`.
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
                    // Count only this user's clips: folder slugs are not unique across users.
                    $lookup: {
                        from: "contents",
                        let: { slug: "$slug" },
                        pipeline: [
                            { $match: { $expr: { $and: [{ $eq: ["$userId", userId] }, { $eq: ["$folder", "$$slug"] }] } } },
                            { $count: "n" }
                        ],
                        as: "contents"
                    }
                },
                { $addFields: { contents: { $ifNull: [{ $arrayElemAt: ["$contents.n", 0] }, 0] } } },
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
        const { name, visibility } = http.validatedBody<{
            name: string;
            visibility: FolderDataType["visibility"];
        }>();

        /**
         * Create folder.
         */
        const folder = await Folder.create({ userId, name, visibility });

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
     * @openapi
     * /client/v1/folder/{folder}/rename:
     *   post:
     *     tags: [Folders]
     *     summary: Rename folder
     *     description: |
     *       Renames a folder. The slug is derived from the new name, and every clip and file in
     *       the folder is moved to the new slug, so the client must use the returned `slug` from
     *       now on. The default `clipboard` and `encrypted` folders cannot be renamed.
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: folder, required: true, schema: { type: string }, description: Current folder slug. }
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/RenameFolderBody" }
     *           example: { name: Work notes }
     *     responses:
     *       200:
     *         description: The renamed folder.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/Folder" }
     *       400:
     *         description: Validation error, protected folder, or a folder with that name already exists.
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
     * Rename a folder and move its clips and files to the new slug.
     */
    async rename(http, { folder }) {
        const { name } = http.validatedBody<{ name: string }>();
        const { userId, slug: oldSlug } = folder.data;

        if (["clipboard", "encrypted"].includes(oldSlug)) {
            return http.badRequestError(`Folder '${folder.data.name}' is a default folder and cannot be renamed.`);
        }

        const newSlug = slugify(name, { lower: true, replacement: "-" });
        if (!/[a-z0-9]/.test(newSlug)) return http.badRequestError("Folder name must contain letters or numbers.");

        if (name === folder.data.name) return { ...folder.getPublicFields(), info: "Folder name unchanged." };

        // Another folder already owns the new slug?
        const clash = await Folder.exists({ userId, slug: newSlug, _id: { $ne: folder.id() } });
        if (clash) return http.badRequestError(`Folder with name: '${name}' already exists.`);

        await folder.update({ name, slug: newSlug });

        if (newSlug !== oldSlug) {
            await Promise.all([
                Content.native().updateMany({ userId, folder: oldSlug }, { $set: { folder: newSlug } }),
                File.native().updateMany({ userId, folder: oldSlug }, { $set: { folder: newSlug } })
            ]);
        }

        return { ...folder.getPublicFields(), message: "Folder renamed." };
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
     *     description: |
     *       Deletes the folder and every clip in it. Files in the folder are removed from owns3
     *       first, so storage must be connected when the folder holds any.
     *       A folder that has a password is deleted only when the request carries that password,
     *       as its MD5 hash, in the body. Folders without one are deleted straight away.
     *       The default `clipboard` folder can never be deleted.
     *     security: [{ ocToken: [] }]
     *     parameters:
     *       - { in: path, name: folder, required: true, schema: { type: string }, description: Folder slug. }
     *     requestBody:
     *       description: Required only when the folder has a password.
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/DeleteFolderBody" }
     *           example: { password: 5f4dcc3b5aa765d61d8327deb882cf99 }
     *     responses:
     *       200:
     *         description: Deleted.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/MessageResponse" }
     *       400:
     *         description: Missing or wrong folder password, the default folder, or files that cannot be removed.
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
        if (folder.has("slug", "clipboard")) {
            return http.badRequestError(
                `Folder ${folder.data.name} cannot be deleted! It is the default folder.`
            );
        }

        // A folder with a password is only deleted after confirming that password.
        if (folder.has("hasPassword", true)) {
            const password = http.body("password", undefined) as unknown;

            if (typeof password !== "string" || !password.length) {
                return http.error("This folder has a password, send it to delete the folder.", 400, {
                    field: "password"
                });
            }

            // The client sends the md5 of the password, never the password itself.
            if (!Abolish.test(password, "md5")) {
                return http.error("Password is not a valid md5 hash.", 400, { field: "password" });
            }

            if (!folder.matchPassword(password)) {
                return http.error("Password is incorrect!", 400, { field: "password" });
            }
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
