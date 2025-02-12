import Subscription from "../models/Subscription";
import axios from "axios";
import { env } from "../../env";

// curl --location 'https://api.nowpayments.io/v1/invoice' \
// --header 'x-api-key: {{api-key}}' \
// --header 'Content-Type: application/json' \
// --data '{
//   "price_amount": 1000,
//   "price_currency": "usd",
//   "order_id": "RGDBP-21314",
//   "order_description": "Apple Macbook Pro 2019 x 1",
//   "ipn_callback_url": "https://nowpayments.io",
//   "success_url": "https://nowpayments.io",
//   "cancel_url": "https://nowpayments.io"
// }
//
//

const $api = axios.create({
    baseURL: "https://api.nowpayments.io/v1",
    headers: {
        "x-api-key": env.NOW_PAYMENTS_API_KEY,
    }
})

class NowPayment {
    static async createInvoice(sub: Subscription) {
        try {
            const { data } = await $api.post("/invoice", {
                price_amount: sub.data.amount,
                price_currency: "usd",
                order_id: sub.data.publicId,
                order_description: `Subscription to ${sub.data.plan} plan`,
                ipn_callback_url: `${env.WEBHOOK_URL}/api/now-payment/ipn`,
                success_url: `${env.FRONTEND_URL}/account/subscription`,
                cancel_url: `${env.FRONTEND_URL}/account/subscription`,
                is_fee_paid_by_user: true
            });

            return data;
        } catch (e: any) {
            console.log(e.response.data);
            throw new Error("Failed to create invoice");
        }
    }
}

export default NowPayment;