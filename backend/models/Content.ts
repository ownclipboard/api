import { is, joi, ObjectId, RefreshDateOnUpdate, XMongoSchema } from "xpress-mongo";
import { UseCollection } from "@xpresser/xpress-mongo";
import BaseModel, { IndexUuid } from "./BaseModel";
import bcrypt from "bcryptjs";
import Folder, { FolderDataType } from "./Folder";
import { Abolish } from "abolish";

/**
 * Interface for Model's `this.data`. (For Typescript)
 * Optional if accessing data using model helper functions
 *
 * @example
 * this.data.updatedAt? // type Date
 * this.data.createdAt // type Date
 */
export interface ContentDataType {
    userId: ObjectId;
    uuid: string;
    title: string;
    type: "text" | "url" | "html" | "image";
    folder: "clipboard" | "encrypted" | string;
    visibility: "public" | "private" | "encrypted";
    publicPaste?: boolean;
    size: { human: string, bytes: number };
    context: string;
    encrypted: boolean;
    password?: string;
    locked: boolean;
    favorite: boolean;
    updatedAt?: Date;
    createdAt: Date;
}

class Content extends BaseModel {
    /**
     * Model Schema
     */
    static schema: XMongoSchema<ContentDataType> = {
        userId: is.ObjectId().required(),
        uuid: is.Uuid(4).required(),
        title: is.String(),
        type: is.String("text").required(),
        folder: is.String("clipboard").required(),
        visibility: is.InArray(["public", "private", "encrypted"], "public").required(),
        context: is.String().required(),
        
        size: joi.object({
            human: joi.string().required(),
            bytes: joi.number().required()
        }).required(),

        password: is.String().undefined(),
        encrypted: is.Boolean().undefined(),
        locked: is.Boolean().undefined(),
        favorite: is.Boolean().undefined(),
        publicPaste: is.Boolean().undefined(),

        updatedAt: is.Date(),
        createdAt: is.Date().required()
    };

    static publicFields = [
        "uuid",
        "title",
        "type",
        "folder",
        "context",
        "locked",
        "favorite",
        "updatedAt",
        "encrypted"
    ];

    // SET Type of this.data.
    public data!: ContentDataType;

    folder(options?: any) {
        return Folder.findOne(
            <FolderDataType>{ slug: this.data.folder, userId: this.data.userId },
            options
        );
    }

    setPassword(password: string) {
        this.data.encrypted = true;
        this.data.password = bcrypt.hashSync(password, 10);

        return this;
    }

    matchPassword(password: string): boolean {
        if (!this.data.password) return false;

        return bcrypt.compareSync(password, this.data.password);
    }

    setContextType() {
        let type: ContentDataType["type"] = "text";

        // Check if it is an url
        if (Abolish.test(this.data.context, "url")) type = "url";

        // Set content type
        this.data.type = type;

        return this;
    }
}

/**
 * Map Model to Collection: `contents`
 * .native() will be made available for use.
 */
UseCollection(Content, "contents");

// Index Uuid
IndexUuid(Content);

// Index userId & folder
Promise.all([
    Content.native().createIndex({ folder: 1 }),
    Content.native().createIndex({ userId: 1 })
]).catch(console.error);

// Refresh "updatedAt" on update if has changes.
RefreshDateOnUpdate(Content, "updatedAt", true);

// Export Model as Default
export default Content;
