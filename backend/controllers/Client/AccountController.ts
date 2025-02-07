import type { Controller, Http } from "xpresser/types/http";
import { compileSchemaT } from "abolish";

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
    setPlan(http) {
        const [err, body] = http.validateBody(SetPlanSchema);
        if (err) return http.abolishError(err);

        console.log(http.authUserId());

        return { body }
    }
};
