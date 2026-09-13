import { CreateIndex, is, joi, ObjectId, XMongoSchema } from "xpress-mongo";
import { UseCollection } from "@xpresser/xpress-mongo";
import BaseModel from "./BaseModel";
import Folder from "./Folder";
import { PublicIdSchema } from "./schemas/schemas";
import { oc_nanoid } from "../functions/string.fn";

/**
 * Interface for Model's `this.data`. (For Typescript)
 * Optional if accessing data using model helper functions
 *
 * @example
 * this.data.updatedAt? // type Date
 * this.data.createdAt // type Date
 */
export interface UserDataType {
    _id: ObjectId;
    username: string;
    publicId: string;
    password: string;
    email?: string;
    joinedAt: Date;
    plan?: "free" | "pro";

    /**
     * Login Token
     * This token is used to clear all user login sessions.
     * It is embedded in the jwt token.
     * So if it changes, all user sessions will be invalidated.
     * It will be refreshed under these conditions:
     *  - User changes password
     *  - User clears all sessions
     *  - User is banned
     */
    loginToken: string;

    /**
     * The user's own owns3 server, where their files are stored.
     * `apiKey` is encrypted at rest (see lib/Crypto).
     */
    owns3?: Owns3Config;
}

export interface Owns3Config {
    endpoint: string;
    apiKey: string;
    app: { id: string; name: string; slug: string; folder: string };
    permissions: string[];
    connectedAt: Date;
}

class User extends BaseModel {
    /**
     * Model Schema
     */
    static schema: XMongoSchema<UserDataType> = {
        username: is.String().required(),
        publicId: PublicIdSchema(undefined, 10).required(),
        password: is.String().required(),
        email: is.String().optional(),
        joinedAt: is.Date().required(),
        plan: is.InArray(["free", "pro"]).optional(),
        loginToken: is.String(() => oc_nanoid(21)).required(),
        owns3: joi
            .object({
                endpoint: joi.string().required(),
                apiKey: joi.string().required(),
                app: joi
                    .object({
                        id: joi.string().required(),
                        name: joi.string().required(),
                        slug: joi.string().required(),
                        folder: joi.string().allow("").required()
                    })
                    .required(),
                permissions: joi.array().items(joi.string()).required(),
                connectedAt: joi.date().required()
            })
            .optional()
    };

    static publicFields = ["username", "publicId", "email", "joinedAt", "plan"];

    // SET Type of this.data.
    public data!: UserDataType;

    // create default folders
    public createDefaultFolders() {
        return Promise.all([
            // Create default `clipboard` folder
            Folder.create({ userId: this.id(), name: "Clipboard" }),
            // Create default `encrypted` folder
            Folder.create({
                userId: this.id(),
                name: "Encrypted",
                visibility: "encrypted"
            })
        ]);
    }
}

/**
 * Map Model to Collection: `users`
 * .native() will be made available for use.
 */
UseCollection(User, "users");
CreateIndex(User, "publicId", true)

// Export Model as Default
export default User;
