import { is, ObjectId, XMongoSchema } from "xpress-mongo";
import { UseCollection } from "@xpresser/xpress-mongo";
import BaseModel from "./BaseModel";
import slugify from "slugify";

/**
 * Interface for Model's `this.data`. (For Typescript)
 * Optional if accessing data using model helper functions
 *
 * @example
 * this.data.updatedAt? // type Date
 * this.data.createdAt // type Date
 */
export interface FolderDataType {
    name: string;
    slug: string;
    userId: string;
    updatedAt?: Date;
    createdAt: Date;
}

class Folder extends BaseModel {
    /**
     * Model Schema
     */
    static schema: XMongoSchema<FolderDataType> = {
        name: is.String().required(),
        userId: is.ObjectId().required(),
        slug: is.String().required().unique(),
        updatedAt: is.Date(),
        createdAt: is.Date().required()
    };

    static publicFields = ["name", "slug"];

    // SET Type of this.data.
    public data!: FolderDataType;

    static create(userId: ObjectId, name: string) {
        const slug = slugify(name, { lower: true, replacement: "-" });

        return this.new({
            name,
            slug,
            userId
        });
    }
}

/**
 * Map Model to Collection: `folders`
 * .native() will be made available for use.
 */
UseCollection(Folder, "folders");

// Index userId & slug
Promise.all([
    Folder.native().createIndex({ userId: 1 }),
    Folder.native().createIndex({ slug: 1 })
]).catch(console.error);

// Export Model as Default
export default Folder;
