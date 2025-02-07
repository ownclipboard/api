import { CreateIndex, is, ObjectId, XMongoSchema } from "xpress-mongo";
import { UseCollection } from "@xpresser/xpress-mongo";
import BaseModel from "./BaseModel";
import { PublicIdSchema } from "./schemas/schemas";

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
    publicId: string;
    apiKey: string;
    hits: number;
    enabled: boolean;
    updatedAt?: Date;
    createdAt: Date;
}

class Device extends BaseModel {
    /**
     * Model Schema
     */
    static schema: XMongoSchema<DeviceDataType> = {
        userId: is.ObjectId().required(),
        name: is.String().required(),
        publicId: PublicIdSchema().required(),
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
CreateIndex(Device,"publicId", true);

// Export Model as Default
export default Device;
