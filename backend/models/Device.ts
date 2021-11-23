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
export interface DeviceDataType {
    updatedAt?: Date;
    createdAt: Date;
}


class Device extends XMongoModel {
    /**
     * Model Schema
     */
    static schema: XMongoSchema<DeviceDataType> = {
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
