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
    username: string;
    password: string;
    email?: string;
    joinedAt: Date;
}

class User extends XMongoModel {
    /**
     * Model Schema
     */
    static schema: XMongoSchema<UserDataType> = {
        username: is.String().required(),
        password: is.String().required(),
        email: is.String().required(),
        joinedAt: is.Date().required()
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
