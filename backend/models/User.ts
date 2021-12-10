import { is, XMongoSchema } from "xpress-mongo";
import { UseCollection } from "@xpresser/xpress-mongo";
import BaseModel from "./BaseModel";
import Folder from "./Folder";

/**
 * Interface for Model's `this.data`. (For Typescript)
 * Optional if accessing data using model helper functions
 *
 * @example
 * this.data.updatedAt? // type Date
 * this.data.createdAt // type Date
 */
export interface UserDataType {
    username: string;
    password: string;
    email?: string;
    joinedAt: Date;
}

class User extends BaseModel {
    /**
     * Model Schema
     */
    static schema: XMongoSchema<UserDataType> = {
        username: is.String().required(),
        password: is.String().required(),
        email: is.String().optional(),
        joinedAt: is.Date().required()
    };

    static publicFields = ["username", "email"];

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

// Export Model as Default
export default User;
