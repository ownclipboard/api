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
export interface UserDataType {
    updatedAt?: Date;
    createdAt: Date;
}


class User extends XMongoModel {
    /**
     * Model Schema
     */
    static schema: XMongoSchema<UserDataType> = {
        updatedAt: is.Date(),
        createdAt: is.Date().required()
    };

    // SET Type of this.data.
    public data!: UserDataType;
}

/**
 * Map Model to Collection: `users`
 * .native() will be made available for use.
 */
UseCollection(User, "users");

// Export Model as Default
export default User;
