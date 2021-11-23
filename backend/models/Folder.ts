import { is, XMongoSchema } from "xpress-mongo";
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
export interface FolderDataType {
    name: string;
    uuid: string;
    updatedAt?: Date;
    createdAt: Date;
}

class Folder extends BaseModel {
    /**
     * Model Schema
     */
    static schema: XMongoSchema<FolderDataType> = {
        name: is.String().required(),
        uuid: is.Uuid(4).required(),
        updatedAt: is.Date(),
        createdAt: is.Date().required()
    };

    // SET Type of this.data.
    public data!: FolderDataType;
}

/**
 * Map Model to Collection: `folders`
 * .native() will be made available for use.
 */
UseCollection(Folder, "folders");

// Index Uuid
IndexUuid(Folder);

// Export Model as Default
export default Folder;
