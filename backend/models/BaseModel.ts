import { is, XMongoModel, XMongoSchema } from "xpress-mongo";
import { UseCollection } from "@xpresser/xpress-mongo";

/**
 * Interface for Model's `this.data`. (For Typescript)
 * Optional if accessing data using model helper functions
 *
 * @example
 * this.data.updatedAt? // type Date
 * this.data.createdAt // type Date
 */
export interface BaseModelDataType {
    updatedAt?: Date;
    createdAt: Date;
}


class BaseModel extends XMongoModel {
    /**
     * Model Schema
     */
    static schema: XMongoSchema<BaseModelDataType> = {
        updatedAt: is.Date(),
        createdAt: is.Date().required()
    };

    // SET Type of this.data.
    public data!: BaseModelDataType;
}

/**
 * Map Model to Collection: `base_models`
 * .native() will be made available for use.
 */
UseCollection(BaseModel, "base_models");

// Export Model as Default
export default BaseModel;
