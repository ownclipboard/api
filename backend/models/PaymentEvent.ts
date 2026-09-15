import { is, ObjectId, XMongoModel, XMongoSchema } from "xpress-mongo";
import { UseCollection } from "@xpresser/xpress-mongo";

/**
 * Every payment provider webhook call is stored here before it is processed.
 * Useful for auditing and for debugging missed activations.
 */
export interface PaymentEventDataType {
    _id: ObjectId;
    provider: "nowpayments";
    createdAt: Date;
    // Provider's payment id (NowPayments: payment_id)
    paymentId?: string;
    // Provider's invoice id (NowPayments: invoice_id)
    invoiceId?: string;
    // Our order id, i.e. the subscription's publicId
    orderId?: string;
    // Provider's payment status
    status?: string;
    // Whether the webhook signature was valid
    signatureValid: boolean;
    // Whether the event was applied to a subscription
    processed: boolean;
    // Error message if processing failed or was skipped
    error?: string;
    // Raw webhook body
    payload: Record<string, any>;
}

class PaymentEvent extends XMongoModel {
    static schema: XMongoSchema<PaymentEventDataType> = {
        provider: is.String().required(),
        createdAt: is.Date().required(),
        paymentId: is.String().optional(),
        invoiceId: is.String().optional(),
        orderId: is.String().optional(),
        status: is.String().optional(),
        signatureValid: is.Boolean(false).required(),
        processed: is.Boolean(false).required(),
        error: is.String().optional(),
        payload: is.Object().required()
    };

    public data!: PaymentEventDataType;
}

UseCollection(PaymentEvent, "payment_events");

export default PaymentEvent;
