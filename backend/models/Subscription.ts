import { is, joi, ObjectId, XMongoModel, XMongoSchema } from "xpress-mongo";
import { UseCollection } from "@xpresser/xpress-mongo";
import { PublicIdSchema } from "./schemas/schemas";

/**
 * Interface for Model's `this.data`. (For Typescript)
 * Optional if accessing data using model helper functions
 */
export interface SubscriptionDataType {
    _id: string;
    publicId: string;
    type: "trial" | "monthly" | "yearly";
    createdAt: Date;
    userId: string;
    plan: "pro";
    amount: number;
    status: "pending" | "active" | "cancelled";
    duration: number;
    expiresAt: Date;
    invoice?: {
        provider: "nowpayments";
        id: string;
        status: "pending" | "paid" | "cancelled";
        url?: string;
    },
}

export type SubStat = {
    type: SubscriptionDataType["type"];
    status: SubscriptionDataType["status"];
    duration: SubscriptionDataType["duration"];
    expiresAt: SubscriptionDataType["expiresAt"];
    expired: boolean;
}


class Subscription extends XMongoModel {
    /**
     * Model Schema
     */
    static schema: XMongoSchema<SubscriptionDataType> = {
        publicId: PublicIdSchema().required(),
        type: is.InArray(["trial", "monthly", "yearly"]).required(),
        createdAt: is.Date().required(),
        userId: is.ObjectId().required(),
        plan: is.String().required(),
        amount: is.Number().required(),
        status: is.String().required(),
        duration: is.Number().optional(),
        expiresAt: is.Date().optional(),
        invoice: joi.object({
            provider: joi.string().required(),
            id: joi.string().required(),
            status: joi.string().required(),
            url: joi.string().optional()
        }).optional()
    };

    static publicFields = ["publicId", "type", "createdAt", "plan", "amount", "status", "duration", "expiresAt"];

    // SET Type of this.data.
    public data!: SubscriptionDataType;


    static create(
        userId: ObjectId,
        plan: SubscriptionDataType["plan"],
        type: SubscriptionDataType["type"],
        amount: number,
        duration: number,
        status: SubscriptionDataType["status"] = "pending"
    ) {
        let expiresDuration: number;
        if (!duration) duration = 1;

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
            status,
            duration,
            expiresAt: new Date(Date.now() + (1000 * 60 * 60 * 24 * expiresDuration))
        });
    }


    toStat(): SubStat {
        const { type, status, duration, expiresAt } = this.data;
        return {
            type,
            status,
            duration,
            expiresAt,
            expired: expiresAt < new Date()
        };
    }
}

/**
 * Map Model to Collection: `subscriptions`
 * .native() will be made available for use.
 */
UseCollection(Subscription, "subscriptions");

// Export Model as Default
export default Subscription;
