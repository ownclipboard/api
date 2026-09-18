import { CreateIndex, is, joi, ObjectId, RefreshDateOnUpdate, XMongoSchema } from "xpress-mongo";
import { UseCollection } from "@xpresser/xpress-mongo";
import BaseModel from "./BaseModel";
import bcrypt from "bcryptjs";
import Folder, { FolderDataType } from "./Folder";
import { PublicIdSchema } from "./schemas/schemas";

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
    publicId: string;
    title: string;
    type: "text" | "url" | "html" | "file";
    folder: "clipboard" | "encrypted" | string;
    visibility: "public" | "private" | "encrypted";
    publicPaste?: boolean;
    size: { human: string, bytes: number };
    context: string;
    encrypted: boolean;
    password?: string;
    locked: boolean;
    favorite: boolean;
    /** Set on file clips: reference to the `files` collection. */
    fileId?: ObjectId;
    /** File clips only: the file reference and its extension (name and size live on the clip). */
    file?: { publicId: string; ext: string };
    updatedAt?: Date;
    createdAt: Date;
}

/** An explicit http(s) link: the scheme says what it is, whatever the host. */
const SCHEMED_URL = /^https?:\/\/\S+$/i;

/**
 * A link without a scheme: a host with a real tld or an ipv4 address,
 * an optional port and an optional path.
 */
const URL_PATTERN =
    /^(?:https?:\/\/)?(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}|\d{1,3}(?:\.\d{1,3}){3})(?::\d{2,5})?(?:[/?#]\S*)?$/i;

class Content extends BaseModel {
    /**
     * Model Schema
     */
    static schema: XMongoSchema<ContentDataType> = {
        userId: is.ObjectId().required(),
        publicId: PublicIdSchema().required(),
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

        fileId: is.ObjectId(),
        file: joi
            .object({
                publicId: joi.string().required(),
                ext: joi.string().allow("").required()
            })
            .optional(),

        updatedAt: is.Date(),
        createdAt: is.Date().required()
    };

    static publicFields = [
        "publicId",
        "title",
        "type",
        "folder",
        "context",
        "locked",
        "favorite",
        "createdAt",
        "updatedAt",
        "encrypted",
        "file"
    ];

    // SET Type of this.data.
    public data!: ContentDataType;

    isFile() {
        return !!this.data.fileId;
    }

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

    /**
     * Is this clip a link?
     *
     * Only when the whole content is one token that looks like a url. This used to ask
     * abolish's `url` validator, which is `new URL()` in a try/catch: that accepts any
     * `word:` prefix as a scheme and strips newlines, so notes like "Name: John" and
     * "TODO: buy milk" were stored as links while a bare "example.com" was not.
     */
    static isUrl(context: string): boolean {
        const text = (context || "").trim();

        // A link has no spaces in it, and is never a wall of text.
        if (!text || text.length > 2048 || /\s/.test(text)) return false;

        return SCHEMED_URL.test(text) || URL_PATTERN.test(text);
    }

    setContextType() {
        this.data.type = Content.isUrl(this.data.context) ? "url" : "text";

        return this;
    }
}

/**
 * Map Model to Collection: `contents`
 * .native() will be made available for use.
 */
UseCollection(Content, "contents");
CreateIndex(Content, "publicId", true);
CreateIndex(Content, ["userId", "folder"]);




// Index userId & folder
// Promise.all([
//     Content.native().createIndex({ folder: 1 }),
//     Content.native().createIndex({ userId: 1 })
// ]).catch(console.error);

// Refresh "updatedAt" on update if has changes.
RefreshDateOnUpdate(Content, "updatedAt", true);

// Export Model as Default
export default Content;
