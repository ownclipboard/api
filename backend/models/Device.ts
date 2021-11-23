import { is, ObjectId, XMongoModel, XMongoSchema } from "xpress-mongo";
import { UseCollection } from "@xpresser/xpress-mongo";

/**
 * Interface for Model's `this.data`. (For Typescript)
 * Optional if accessing data using model helper functions
 *
 * @example
 * this.data.updatedAt? // type Date
 * this.data.createdAt // type Date
 */
export interface DeviceDataType {
    userId: ObjectId;
    name: string;
    code: string;
    apiKey: string;
    hits: number;
    enabled: boolean;
    updatedAt?: Date;
    createdAt: Date;
}

class Device extends XMongoModel {
    /**
     * Model Schema
     */
    static schema: XMongoSchema<DeviceDataType> = {
        userId: is.ObjectId().required(),
        name: is.String().required(),
        code: is.Uuid(4).required(),
        apiKey: is.String().required(),
        hits: is.Number().required(),
        enabled: is.Boolean().required(),
        updatedAt: is.Date(),
        createdAt: is.Date().required()
    };

    // SET Type of this.data.
    public data!: DeviceDataType;
}

/**
 * Map Model to Collection: `devices`
 * .native() will be made available for use.
 */
UseCollection(Device, "devices");

// Export Model as Default
export default Device;
