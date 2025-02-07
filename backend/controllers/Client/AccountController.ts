import type { Controller, Http } from "xpresser/types/http";
import { compileSchemaT } from "abolish";
import User, { UserDataType } from "../../models/User";
import Subscription from "../../models/Subscription";

const SetPlanSchema = compileSchemaT({
    plan: { required: true, string: true, inArray: ["free", "pro"] }
});


/**
 * AccountController
 */
export = <Controller.Object>{
    // Controller Name
    name: "AccountController",

    // Controller Default Error Handler.
    e: (http: Http, error: string) => http.status(401).json({ error }),


    /**
     * Set Plan
     * @param http - Current Http Instance
     */
    async setPlan(http) {
        type body = { plan: UserDataType["plan"] };
        const [err, body] = http.validateBody<body>(SetPlanSchema);
        if (err) return http.abolishError(err);

        const user = http.authData();

        if (user.plan === body.plan) {
            return http.badRequestError("Plan is already set to " + body.plan);
        }


        // if plan is pro, then it is try pro
        // create subscription
        if(body.plan === "pro") {
            const sub =  Subscription.create(user._id, "pro", "trial", 0, 1)
            sub.data.status = "active";
            await sub.save()
        }


        await User.native().updateOne(
            { _id: user._id },
            { $set: { plan: body.plan } }
        );


        return { message: "Plan updated successfully!" };
    }
};
