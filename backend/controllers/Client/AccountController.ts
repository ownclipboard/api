import type { Controller, Http } from "xpresser/types/http";

/**
 * AccountController
 */
export = <Controller.Object>{
    // Controller Name
    name: "AccountController",

    // Controller Default Error Handler.
    e: (http: Http, error: string) => http.status(401).json({ error }),


    /**
    * Example Action.
    * @param http - Current Http Instance
    */
    setPlan(http) {
        return http.send({
            route: http.route
        });
    }
};
