import { CreateIndex, is, ObjectId, XMongoSchema } from "xpress-mongo";
import { UseCollection } from "@xpresser/xpress-mongo";
import BaseModel from "./BaseModel";
import { PublicIdSchema } from "./schemas/schemas";

/**
 * Metadata of a file stored on the user's own owns3 server.
 * The bytes never touch this api: the client uploads straight to a presigned url.
 *
 * Lifecycle: `pending` (upload slot issued) -> `uploaded` (confirmed via owns3 stat).
 */
export interface FileDataType {
    _id: ObjectId;
    publicId: string;
    userId: ObjectId;
    /** Clip that represents this file, set once uploaded. */
    clipId?: ObjectId;
    /** Slug of the folder the clip will be created in. */
    folder: string;
    /** Original file name as given by the client. */
    name: string;
    /** Clip title. Defaults to the file name. */
    title: string;
    /** Lower-cased extension without the dot, e.g. `png`. Empty when the name has none. */
    ext: string;
    /** Object path on owns3, relative to the app folder. */
    path: string;
    /** Bytes, as reported by owns3 after upload (declared size before that). */
    size: number;
    contentType: string;
    etag?: string;
    status: "pending" | "uploaded";
    createdAt: Date;
    uploadedAt?: Date;
}

class File extends BaseModel {
    static schema: XMongoSchema<FileDataType> = {
        publicId: PublicIdSchema().required(),
        userId: is.ObjectId().required(),
        clipId: is.ObjectId(),
        folder: is.String("clipboard").required(),
        name: is.String().required(),
        title: is.String().required(),
        ext: is.String("").required(),
        path: is.String().required(),
        size: is.Number(0).required(),
        contentType: is.String("application/octet-stream").required(),
        etag: is.String(),
        status: is.InArray(["pending", "uploaded"], "pending").required(),
        createdAt: is.Date().required(),
        uploadedAt: is.Date().undefined()
    };

    static publicFields = ["publicId", "name", "title", "ext", "folder", "size", "contentType", "status", "createdAt", "uploadedAt"];

    public data!: FileDataType;

    /** Extension of a file name, lower-cased, without the dot. */
    static extensionOf(name: string) {
        const match = /\.([A-Za-z0-9]{1,16})$/.exec(name.trim());
        return match ? match[1].toLowerCase() : "";
    }

    /** Reference stored on the clip. */
    summary() {
        const { publicId, ext } = this.data;
        return { publicId, ext };
    }
}

UseCollection(File, "files");
CreateIndex(File, "publicId", true);
CreateIndex(File, ["userId", "status"]);

export default File;
