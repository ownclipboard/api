import type { Controller, Http } from "xpresser/types/http";
import { compileSchemaT } from "abolish";
import Subscription, { SubscriptionDataType } from "../models/Subscription";

const SubscribeSchema = compileSchemaT({
    plan: { required: true, string: true, inArray: ["pro"] },
    duration: { required: true, number: true, min: 1, max: 5 },
    type: { required: true, string: true, inArray: ["monthly", "yearly"] }
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
     * Example Action.
     * @param http - Current Http Instance
     */
    async subscribe(http) {
        type body = Pick<SubscriptionDataType, "plan" | "duration" | "type">;

        const [err, body] = http.validateBody<body>(SubscribeSchema);
        if (err) return http.abolishError(err);

        const user = http.authData();

        // $1 per month
        // $10 per year
        let price = 2;
        if (body.type === "yearly") price = 20;
        price = price * body.duration;


        // check if user a pending subscription of the same type
        let sub = await Subscription.findOne({
            userId: user._id,
            plan: body.plan,
            status: "pending",
            type: body.type,
            duration: body.duration
        });


        if (!sub) {
            sub = Subscription.create(user._id, body.plan, body.type, price, body.duration);
            await sub.save();
        }


        return { subscription: sub.toStat(), message: "Subscription created successfully!" };
    }
};
