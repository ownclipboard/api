import { Controller, Http } from "xpresser/types/http";

/**
 * ApiController
 * Basic Api related actions are declared here.
 */
export = <Controller.Object>{
    // Controller Name
    name: "ApiController",

    // Controller Default Error Handler.
    e: (http: Http, error: string) => http.status(401).json({ error })
};
