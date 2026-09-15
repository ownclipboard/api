import type { Controller, Http } from "xpresser/types/http";
import { compileSchemaT } from "abolish";
import Subscription, { SubscriptionDataType } from "../models/Subscription";
import NowPayment from "../lib/NowPayment";
import { planPrice } from "../lib/Plans";
import { isStringRequired } from "../abolish/reusables";

const SubscribeSchema = compileSchemaT({
    plan: { required: true, string: true, inArray: ["pro"] },
    duration: { required: true, number: true, min: 1, max: 5 },
    type: { required: true, string: true, inArray: ["monthly", "yearly"] }
});

const CancelSchema = compileSchemaT({
    subscription: isStringRequired
});

/**
 * SubscriptionController
 */
export = <Controller.Object>{
    // Controller Name
    name: "SubscriptionController",

    // Controller Default Error Handler.
    e: (http: Http, error: string) => http.status(401).json({ error }),

    /**
     * @openapi
     * /client/v1/account/subscribe:
     *   post:
     *     tags: [Subscription]
     *     summary: Create a Pro subscription invoice
     *     description: |
     *       Creates a pending subscription and a NowPayments hosted invoice for it.
     *       Redirect the user to `invoice.url` to pay. The subscription activates
     *       through the payment webhook, usually a few minutes after payment.
     *
     *       If the user already has a pending subscription with the same plan, type
     *       and duration, its existing invoice is returned instead of creating a new one.
     *     security: [{ ocToken: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/SubscribeBody" }
     *           example: { plan: pro, type: yearly, duration: 1 }
     *     responses:
     *       200:
     *         description: Invoice created or reused.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/SubscribeResponse" }
     *       400:
     *         description: Validation error.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       401:
     *         description: Missing or invalid `oc_token`.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       502:
     *         description: NowPayments could not create the invoice.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Create a pending subscription and a NowPayments invoice for it.
     * Returns the invoice url the client should redirect the user to.
     *
     * If the user already has a pending subscription with the same
     * plan/type/duration and an invoice, that invoice is returned instead.
     */
    async subscribe(http) {
        type body = { plan: "pro"; duration: number; type: Exclude<SubscriptionDataType["type"], "trial"> };

        const [err, body] = http.validateBody<body>(SubscribeSchema);
        if (err) return http.abolishError(err);

        const user = http.authData();
        const price = planPrice(body.plan, body.type, body.duration);

        // Reuse a pending subscription of the same shape if it exists.
        let sub = await Subscription.findOne(
            {
                userId: user._id,
                plan: body.plan,
                type: body.type,
                duration: body.duration,
                status: "pending"
            },
            { sort: { createdAt: -1 } }
        );

        if (sub && sub.data.invoice?.url) {
            return {
                subscription: sub.toStat(),
                invoice: sub.toStat().invoice,
                message: "You already have a pending invoice for this subscription."
            };
        }

        const isNew = !sub;

        if (!sub) {
            sub = Subscription.create(user._id, body.plan, body.type, price, body.duration);
            await sub.save();
        }

        try {
            const invoice = await NowPayment.createInvoice(sub);

            sub.data.invoice = {
                provider: "nowpayments",
                id: String(invoice.id),
                url: invoice.invoice_url,
                status: "pending",
                updatedAt: new Date()
            };

            await sub.save();
        } catch (e: any) {
            // Don't leave an orphan subscription behind if the invoice could not be created.
            if (isNew) await sub.delete();
            return http.error(e.message || "Failed to create payment invoice.", 502);
        }

        return {
            subscription: sub.toStat(),
            invoice: sub.toStat().invoice,
            message: "Invoice created, complete your payment to activate your subscription."
        };
    },

    /**
     * @openapi
     * /client/v1/account/subscription:
     *   get:
     *     tags: [Subscription]
     *     summary: Current subscription status
     *     description: |
     *       Returns the latest active subscription (which may already be expired,
     *       check `expired`) and every pending subscription with its invoice, so the
     *       client can offer "continue payment" or "cancel".
     *     security: [{ ocToken: [] }]
     *     responses:
     *       200:
     *         description: Subscription state.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/SubscriptionStatusResponse" }
     *       401:
     *         description: Missing or invalid `oc_token`.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Current subscription status:
     *  - `subscription`: latest active subscription (may be expired)
     *  - `pending`: pending subscriptions with their invoice, newest first
     */
    async status(http) {
        const userId = http.authUserId();

        const active = await Subscription.findOne(
            { userId, status: "active" },
            { sort: { expiresAt: -1 } }
        );

        const pending = await Subscription.find<SubscriptionDataType>(
            { userId, status: "pending" },
            { sort: { createdAt: -1 } }
        );

        return {
            subscription: active ? active.toStat() : null,
            pending: Subscription.fromArray(pending).map((s) => s.toStat())
        };
    },

    /**
     * @openapi
     * /client/v1/account/subscription/cancel:
     *   post:
     *     tags: [Subscription]
     *     summary: Cancel a pending subscription
     *     description: |
     *       Cancels a pending, unpaid subscription. Paid or active subscriptions cannot
     *       be cancelled here. The NowPayments invoice itself cannot be voided; if it is
     *       paid later anyway, the subscription is activated.
     *     security: [{ ocToken: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/CancelSubscriptionBody" }
     *     responses:
     *       200:
     *         description: Subscription cancelled.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/CancelSubscriptionResponse" }
     *       400:
     *         description: Validation error, or the subscription is not pending.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       404:
     *         description: No such subscription for this user.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Cancel a pending (unpaid) subscription.
     * Paid subscriptions cannot be cancelled here.
     */
    async cancel(http) {
        type body = { subscription: string };

        const [err, body] = http.validateBody<body>(CancelSchema);
        if (err) return http.abolishError(err);

        const userId = http.authUserId();

        const sub = await Subscription.findOne({ userId, publicId: body.subscription });
        if (!sub) return http.error("Subscription not found.", 404);

        if (sub.data.status !== "pending") {
            return http.badRequestError(`Only pending subscriptions can be cancelled. This one is ${sub.data.status}.`);
        }

        await sub.cancel();

        return { subscription: sub.toStat(), message: "Subscription cancelled." };
    }
};
