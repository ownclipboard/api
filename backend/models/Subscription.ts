import { is, joi, ObjectId, XMongoModel, XMongoSchema } from "xpress-mongo";
import { UseCollection } from "@xpresser/xpress-mongo";
import { PublicIdSchema } from "./schemas/schemas";
import User from "./User";

/**
 * NowPayments payment statuses plus our own `pending`
 * (invoice created, no payment started yet).
 * See https://documenter.getpostman.com/view/7907941/2s93JusNJt#payment-statuses
 */
export type InvoiceStatus =
    | "pending"
    | "waiting"
    | "confirming"
    | "confirmed"
    | "sending"
    | "partially_paid"
    | "finished"
    | "failed"
    | "refunded"
    | "expired";

export const InvoiceStatuses: InvoiceStatus[] = [
    "pending",
    "waiting",
    "confirming",
    "confirmed",
    "sending",
    "partially_paid",
    "finished",
    "failed",
    "refunded",
    "expired"
];

export interface SubscriptionInvoice {
    provider: "nowpayments";
    // Provider invoice id
    id: string;
    // Hosted invoice page the user pays on
    url?: string;
    status: InvoiceStatus;
    // Provider payment id, known once the user starts a payment
    paymentId?: string;
    // Currency the user chose to pay with
    payCurrency?: string;
    // Amount actually received, in payCurrency
    actuallyPaid?: number;
    // Last time the provider updated us
    updatedAt?: Date;
}

/**
 * Interface for Model's `this.data`. (For Typescript)
 * Optional if accessing data using model helper functions
 */
export interface SubscriptionDataType {
    _id: string;
    publicId: string;
    type: "trial" | "monthly" | "yearly";
    createdAt: Date;
    userId: ObjectId;
    plan: "pro";
    // Price in USD
    amount: number;
    status: "pending" | "active" | "cancelled";
    // Number of months/years (a trial counts in months too)
    duration: number;
    // When the paid period starts. Set on activation.
    startsAt?: Date;
    expiresAt?: Date;
    activatedAt?: Date;
    cancelledAt?: Date;
    invoice?: SubscriptionInvoice;
}

export type SubStat = {
    publicId: SubscriptionDataType["publicId"];
    plan: SubscriptionDataType["plan"];
    type: SubscriptionDataType["type"];
    status: SubscriptionDataType["status"];
    amount: SubscriptionDataType["amount"];
    duration: SubscriptionDataType["duration"];
    createdAt: SubscriptionDataType["createdAt"];
    startsAt?: SubscriptionDataType["startsAt"];
    expiresAt?: SubscriptionDataType["expiresAt"];
    expired: boolean;
    invoice?: Pick<SubscriptionInvoice, "provider" | "id" | "url" | "status" | "updatedAt">;
};

const DAY = 1000 * 60 * 60 * 24;

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
        status: is.InArray(["pending", "active", "cancelled"]).required(),
        duration: is.Number().optional(),
        startsAt: is.Date().optional(),
        expiresAt: is.Date().optional(),
        activatedAt: is.Date().optional(),
        cancelledAt: is.Date().optional(),
        invoice: joi
            .object({
                provider: joi.string().required(),
                id: joi.string().required(),
                url: joi.string().optional(),
                status: joi
                    .string()
                    .valid(...InvoiceStatuses)
                    .required(),
                paymentId: joi.string().optional(),
                payCurrency: joi.string().optional(),
                actuallyPaid: joi.number().optional(),
                updatedAt: joi.date().optional()
            })
            .optional()
    };

    static publicFields = [
        "publicId",
        "type",
        "createdAt",
        "plan",
        "amount",
        "status",
        "duration",
        "startsAt",
        "expiresAt"
    ];

    // SET Type of this.data.
    public data!: SubscriptionDataType;

    /**
     * Number of days a subscription of `type` lasts for `duration` units.
     */
    static durationInDays(type: SubscriptionDataType["type"], duration: number) {
        if (!duration || duration < 1) duration = 1;

        switch (type) {
            case "trial":
                // A trial is one month, same as a paid month.
                return 30 * duration;
            case "monthly":
                return 30 * duration;
            case "yearly":
                return 365 * duration;
            default:
                return 0;
        }
    }

    static create(
        userId: ObjectId,
        plan: SubscriptionDataType["plan"],
        type: SubscriptionDataType["type"],
        amount: number,
        duration: number,
        status: SubscriptionDataType["status"] = "pending"
    ) {
        if (!duration) duration = 1;

        const sub = this.make(<Partial<SubscriptionDataType>>{
            userId,
            plan,
            type,
            amount,
            status,
            duration
        });

        // Pending subscriptions get their real dates when activated,
        // but we still set a provisional expiry so the shape is consistent.
        sub.setPeriod(new Date());

        if (status === "active") sub.data.activatedAt = new Date();

        return sub;
    }

    /**
     * Latest active subscription of a user that has not expired yet.
     */
    static findCurrentForUser(userId: ObjectId, options?: { exclude?: ObjectId }) {
        const query: Record<string, any> = {
            userId,
            status: "active",
            expiresAt: { $gt: new Date() }
        };

        if (options?.exclude) query._id = { $ne: options.exclude };

        return this.findOne(query, { sort: { expiresAt: -1 } });
    }

    /**
     * Set startsAt/expiresAt from a start date.
     */
    setPeriod(startsAt: Date) {
        const days = Subscription.durationInDays(this.data.type, this.data.duration);
        this.data.startsAt = startsAt;
        this.data.expiresAt = new Date(startsAt.getTime() + days * DAY);
        return this;
    }

    /**
     * Activate this subscription and upgrade the user's plan.
     *
     * If the user still has an unexpired active subscription (trial or paid),
     * the new period starts when that one ends so no paid days are lost.
     */
    async activate() {
        const now = new Date();
        const current = await Subscription.findCurrentForUser(this.data.userId, {
            exclude: this.id()
        });

        const startsAt =
            current && current.data.expiresAt && current.data.expiresAt > now
                ? current.data.expiresAt
                : now;

        this.setPeriod(startsAt);
        this.data.status = "active";
        this.data.activatedAt = now;
        this.data.cancelledAt = undefined;

        await this.save();

        await User.native().updateOne({ _id: this.data.userId }, { $set: { plan: this.data.plan } });

        return this;
    }

    /**
     * Cancel this subscription.
     * If it was the user's only unexpired subscription, downgrade them to free.
     */
    async cancel() {
        this.data.status = "cancelled";
        this.data.cancelledAt = new Date();
        await this.save();

        const current = await Subscription.findCurrentForUser(this.data.userId);
        if (!current) {
            await User.native().updateOne(
                { _id: this.data.userId, plan: this.data.plan },
                { $set: { plan: "free" } }
            );
        }

        return this;
    }

    isExpired() {
        return !this.data.expiresAt || this.data.expiresAt < new Date();
    }

    toStat(): SubStat {
        const { publicId, plan, type, status, amount, duration, createdAt, startsAt, expiresAt, invoice } =
            this.data;

        const stat: SubStat = {
            publicId,
            plan,
            type,
            status,
            amount,
            duration,
            createdAt,
            startsAt,
            expiresAt,
            expired: this.isExpired()
        };

        if (invoice) {
            stat.invoice = {
                provider: invoice.provider,
                id: invoice.id,
                url: invoice.url,
                status: invoice.status,
                updatedAt: invoice.updatedAt
            };
        }

        return stat;
    }
}

/**
 * Map Model to Collection: `subscriptions`
 * .native() will be made available for use.
 */
UseCollection(Subscription, "subscriptions");

// Export Model as Default
export default Subscription;
