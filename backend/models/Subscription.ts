import { is, ObjectId, XMongoModel, XMongoSchema } from "xpress-mongo";
import { UseCollection } from "@xpresser/xpress-mongo";

/**
 * Interface for Model's `this.data`. (For Typescript)
 * Optional if accessing data using model helper functions
 */
export interface SubscriptionDataType {
    _id: string;
    type: "trial" | "monthly" | "yearly";
    createdAt: Date;
    userId: string;
    plan: "pro";
    amount: number;
    status: "pending" | "active" | "cancelled";
    duration: number;
    expiresAt: Date;
}


class Subscription extends XMongoModel {
    /**
     * Model Schema
     */
    static schema: XMongoSchema<SubscriptionDataType> = {
        type: is.InArray(["trial", "monthly", "yearly"]).required(),
        createdAt: is.Date().required(),
        userId: is.ObjectId().required(),
        plan: is.String().required(),
        amount: is.Number().required(),
        status: is.String().required(),
        duration: is.Number().optional(),
        expiresAt: is.Date().optional()
    };

    // SET Type of this.data.
    public data!: SubscriptionDataType;


    static create(
        userId: ObjectId,
        plan: SubscriptionDataType["plan"],
        type: SubscriptionDataType["type"],
        amount: number,
        duration: number,
    ) {
        let expiresDuration: number;
        if(!duration) duration = 1;

        if (type === "trial") {
            // expires in 7 days
            expiresDuration = 7 * duration;
        } else if (type === "monthly") {
            // expires in 30 days
            expiresDuration = 30 * duration;
        } else if (type === "yearly") {
            // expires in 365 days
            expiresDuration = 365 * duration;
        } else {
            expiresDuration = 0;
        }

        return this.make({
            userId,
            plan,
            type,
            amount,
            status: "pending",
            duration,
            expiresAt: new Date(Date.now() + (1000 * 60 * 60 * 24 * expiresDuration))
        })
    }
}

/**
 * Map Model to Collection: `subscriptions`
 * .native() will be made available for use.
 */
UseCollection(Subscription, "subscriptions");

// Export Model as Default
export default Subscription;
