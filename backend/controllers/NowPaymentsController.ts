import type { Controller, Http } from "xpresser/types/http";
import NowPayment, { NowPaymentsIpnPayload } from "../lib/NowPayment";
import PaymentEvent from "../models/PaymentEvent";
import Subscription, { InvoiceStatus, InvoiceStatuses } from "../models/Subscription";

/**
 * Statuses that mean the invoice is settled; later "in progress" updates
 * (which can arrive out of order) must not overwrite them.
 */
const FINAL_STATUSES: InvoiceStatus[] = ["finished", "refunded"];

/**
 * NowPaymentsController
 * Handles Instant Payment Notifications (webhooks) from NowPayments.
 */
export = <Controller.Object>{
    // Controller Name
    name: "NowPaymentsController",

    // Controller Default Error Handler.
    e: (http: Http, error: string) => http.status(500).json({ error }),

    /**
     * IPN callback.
     * Every call is logged to `payment_events`, then applied to the matching subscription.
     *
     * NowPayments retries when it does not get a 2xx response, so we only
     * return non-2xx for things a retry could fix.
     */
    async ipn(http) {
        const body = (http.req.body ?? {}) as NowPaymentsIpnPayload;
        const signature = http.req.headers["x-nowpayments-sig"];
        const signatureValid = NowPayment.verifyIpnSignature(body, signature);

        const event = PaymentEvent.make({
            provider: "nowpayments",
            paymentId: body.payment_id !== undefined ? String(body.payment_id) : undefined,
            invoiceId: body.invoice_id ? String(body.invoice_id) : undefined,
            orderId: body.order_id ?? undefined,
            status: body.payment_status,
            signatureValid,
            processed: false,
            payload: body
        });

        const fail = async (status: number, error: string) => {
            event.data.error = error;
            await event.save();
            return http.status(status).json({ error });
        };

        if (!signatureValid) return fail(401, "Invalid IPN signature.");

        if (!body.order_id) return fail(400, "Missing order_id.");

        const status = body.payment_status;
        if (!InvoiceStatuses.includes(status)) return fail(400, `Unknown payment status: ${status}`);

        const sub = await Subscription.findOne({ publicId: body.order_id });
        if (!sub) return fail(404, "Subscription not found for order_id.");

        const invoice = sub.data.invoice;
        if (!invoice) return fail(409, "Subscription has no invoice.");

        if (body.invoice_id && String(body.invoice_id) !== invoice.id) {
            return fail(409, "invoice_id does not match subscription invoice.");
        }

        // Ignore stale updates for an invoice that is already settled.
        if (FINAL_STATUSES.includes(invoice.status) && !FINAL_STATUSES.includes(status)) {
            event.data.error = `Ignored: invoice already ${invoice.status}.`;
            await event.save();
            return { message: "Ignored stale update." };
        }

        // Update invoice details.
        sub.data.invoice = {
            ...invoice,
            status,
            paymentId: body.payment_id !== undefined ? String(body.payment_id) : invoice.paymentId,
            payCurrency: body.pay_currency ?? invoice.payCurrency,
            actuallyPaid: body.actually_paid ?? invoice.actuallyPaid,
            updatedAt: new Date()
        };

        if (status === "finished") {
            // Guard against a tampered/underpriced invoice being marked paid.
            const priceOk =
                Number(body.price_amount) >= sub.data.amount &&
                String(body.price_currency).toLowerCase() === "usd";

            if (!priceOk) {
                // Keep the previous invoice status so the client does not show it as paid.
                sub.data.invoice.status = invoice.status;
                await sub.save();
                return fail(
                    200,
                    `Not activated: paid ${body.price_amount} ${body.price_currency}, expected ${sub.data.amount} USD.`
                );
            }

            if (sub.data.status === "active") {
                await sub.save();
                event.data.error = "Already active.";
            } else {
                // Money was received, so activate even if the user had cancelled the pending sub.
                await sub.activate();
                event.data.processed = true;
            }
        } else if (status === "refunded") {
            if (sub.data.status === "active") {
                await sub.cancel();
                event.data.processed = true;
            } else {
                await sub.save();
            }
        } else {
            // waiting, confirming, confirmed, sending, partially_paid, failed, expired:
            // record the status, subscription stays pending.
            await sub.save();
            event.data.processed = true;
        }

        await event.save();

        return { message: "ok" };
    }
};
