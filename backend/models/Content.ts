import { is, ObjectId, RefreshDateOnUpdate, XMongoSchema } from "xpress-mongo";
import { UseCollection } from "@xpresser/xpress-mongo";
import BaseModel, { IndexUuid } from "./BaseModel";

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
    type: "text" | "url" | "html";
    folder: "clipboard" | "encrypted" | string;
    context: string;
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
        title: is.String().required(),
        type: is.String("text").required(),
        folder: is.String("clipboard").required(),
        context: is.String().required(),
        locked: is.Boolean().required(),
        favorite: is.Boolean().required(),
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
        "updatedAt"
    ];

    // SET Type of this.data.
    public data!: ContentDataType;
}

/**
 * Map Model to Collection: `contents`
 * .native() will be made available for use.
 */
UseCollection(Content, "contents");

// Index Uuid
IndexUuid(Content);
// Refresh "updatedAt" on update if has changes.
RefreshDateOnUpdate(Content, "updatedAt", true);

// Export Model as Default
export default Content;
