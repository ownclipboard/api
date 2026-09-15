import axios from "axios";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "../../env";
import type Subscription from "../models/Subscription";
import type { InvoiceStatus } from "../models/Subscription";

/**
 * NowPayments api client.
 * Docs: https://documenter.getpostman.com/view/7907941/2s93JusNJt
 */

export type NowPaymentsInvoice = {
    id: string;
    token_id: string;
    order_id: string;
    order_description: string;
    price_amount: string;
    price_currency: string;
    pay_currency: string | null;
    ipn_callback_url: string;
    invoice_url: string;
    success_url: string;
    cancel_url: string;
    created_at: string;
    updated_at: string;
    is_fixed_rate: boolean;
    is_fee_paid_by_user: boolean;
};

/**
 * Body NowPayments posts to our IPN callback url.
 */
export type NowPaymentsIpnPayload = {
    payment_id: number | string;
    invoice_id?: number | string | null;
    payment_status: Exclude<InvoiceStatus, "pending">;
    pay_address?: string;
    price_amount: number;
    price_currency: string;
    pay_amount?: number;
    actually_paid?: number;
    pay_currency?: string;
    order_id: string | null;
    order_description?: string | null;
    purchase_id?: string | number;
    outcome_amount?: number;
    outcome_currency?: string;
    created_at?: string;
    updated_at?: string;
};

export type NowPaymentsPayment = NowPaymentsIpnPayload;

const PRODUCTION_URL = "https://api.nowpayments.io/v1";
const SANDBOX_URL = "https://api-sandbox.nowpayments.io/v1";

const $api = axios.create({
    baseURL: env.NOW_PAYMENTS_SANDBOX ? SANDBOX_URL : PRODUCTION_URL,
    headers: {
        "x-api-key": env.NOW_PAYMENTS_API_KEY,
        "Content-Type": "application/json"
    },
    timeout: 20_000
});

/**
 * Recursively sort object keys.
 * NowPayments signs `JSON.stringify(sortedBody)`, so we must sort the same way.
 */
function sortObject(obj: any): any {
    if (obj === null || typeof obj !== "object") return obj;

    return Object.keys(obj)
        .sort()
        .reduce((result: any, key) => {
            result[key] = sortObject(obj[key]);
            return result;
        }, {});
}

class NowPayment {
    /**
     * Url NowPayments will post payment updates to.
     */
    static ipnUrl() {
        return `${env.WEBHOOK_URL}/webhooks/nowpayments/ipn`;
    }

    /**
     * Where the user lands after paying / cancelling on the hosted invoice page.
     */
    static returnUrl(sub: Subscription, result: "success" | "cancel") {
        return `${env.FRONTEND_URL}/pricing?payment=${result}&subscription=${sub.data.publicId}`;
    }

    /**
     * Create a hosted invoice for a subscription.
     * The subscription's publicId is used as the order id so IPN calls can be matched.
     */
    static async createInvoice(sub: Subscription): Promise<NowPaymentsInvoice> {
        try {
            const { data } = await $api.post<NowPaymentsInvoice>("/invoice", {
                price_amount: sub.data.amount,
                price_currency: "usd",
                order_id: sub.data.publicId,
                order_description: `OwnClipboard ${sub.data.plan} plan: ${sub.data.duration} ${sub.data.type === "yearly" ? "year(s)" : "month(s)"}`,
                ipn_callback_url: this.ipnUrl(),
                success_url: this.returnUrl(sub, "success"),
                cancel_url: this.returnUrl(sub, "cancel"),
                is_fee_paid_by_user: true
            });

            return data;
        } catch (e: any) {
            const details = e?.response?.data ?? e?.message;
            console.error("[NowPayments] createInvoice failed:", details);
            throw new Error("Failed to create payment invoice.");
        }
    }

    /**
     * Fetch a payment's current status.
     */
    static async getPayment(paymentId: string | number): Promise<NowPaymentsPayment> {
        try {
            const { data } = await $api.get<NowPaymentsPayment>(`/payment/${paymentId}`);
            return data;
        } catch (e: any) {
            const details = e?.response?.data ?? e?.message;
            console.error("[NowPayments] getPayment failed:", details);
            throw new Error("Failed to fetch payment status.");
        }
    }

    /**
     * Compute the IPN signature of a webhook body.
     */
    static signIpn(body: Record<string, any>) {
        return createHmac("sha512", env.NOW_PAYMENTS_IPN_SECRET)
            .update(JSON.stringify(sortObject(body)))
            .digest("hex");
    }

    /**
     * Verify the `x-nowpayments-sig` header of a webhook call.
     */
    static verifyIpnSignature(body: Record<string, any>, signature?: string | string[]) {
        if (!signature || Array.isArray(signature)) return false;
        if (!body || typeof body !== "object") return false;

        const expected = Buffer.from(this.signIpn(body), "utf8");
        const received = Buffer.from(signature, "utf8");

        if (expected.length !== received.length) return false;

        return timingSafeEqual(expected, received);
    }
}

export default NowPayment;
