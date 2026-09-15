import { CreateIndex, is, joi, ObjectId, XMongoSchema } from "xpress-mongo";
import { UseCollection } from "@xpresser/xpress-mongo";
import BaseModel from "./BaseModel";
import slugify from "slugify";
import bcrypt from "bcryptjs";
import { PublicIdSchema } from "./schemas/schemas";

/**
 * Interface for Model's `this.data`. (For Typescript)
 * Optional if accessing data using model helper functions
 *
 * @example
 * this.data.updatedAt? // type Date
 * this.data.createdAt // type Date
 */
export interface FolderDataType {
    publicId: string;
    name: string;
    slug: string;
    userId: ObjectId;
    visibility: "public" | "private" | "encrypted";
    hasPassword: boolean;
    password?: string;
    publicPaste?: {
        id: string;
        date: Date;
    };
    updatedAt?: Date;
    createdAt: Date;
}

class Folder extends BaseModel {
    /**
     * Model Schema
     */
    static schema: XMongoSchema<FolderDataType> = {
        publicId: PublicIdSchema().required(),
        name: is.String().required(),
        userId: is.ObjectId().required(),
        slug: is.String().required(),
        visibility: is.InArray(["public", "private", "encrypted"], "public").required(),
        password: is.String(),

        hasPassword: is.Boolean().undefined(),

        publicPaste: joi
            .object({
                id: joi.string().required(),
                date: joi.date().required()
            })
            .optional(),

        updatedAt: is.Date(),
        createdAt: is.Date().required()
    };

    static publicFields = ["name", "slug", "contents", "visibility", "hasPassword", "publicPaste"];

    // SET Type of this.data.
    public data!: FolderDataType;

    static create(
        data: Pick<FolderDataType, "name" | "userId"> & Partial<Pick<FolderDataType, "visibility">>
    ) {
        const slug = slugify(data.name, { lower: true, replacement: "-" });

        return this.new(<FolderDataType>{
            ...data,
            slug
        });
    }

    setPassword(password: string) {
        this.data.hasPassword = true;
        this.data.password = bcrypt.hashSync(password, 10);

        return this;
    }

    matchPassword(password: string): boolean {
        if (!this.data.password) return false;

        return bcrypt.compareSync(password, this.data.password);
    }

    isEncrypted(): boolean {
        return this.data.visibility === "encrypted";
    }
}

/**
 * Map Model to Collection: `folders`
 * .native() will be made available for use.
 */
UseCollection(Folder, "folders");
CreateIndex(Folder, "publicId", true);
CreateIndex(Folder, ["userId", "slug"], true);


// Export Model as Default
export default Folder;
