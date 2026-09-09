import { Controller, Http } from "xpresser/types/http";
import { isDev } from "../../env";

/**
 * ApiController
 * Basic Api related actions are declared here.
 */
export = <Controller.Object>{
    // Controller Name
    name: "ApiController",

    // Controller Default Error Handler.
    e: (http: Http, error: string) => http.status(401).json({ error }),


    notFound: async (http) => {
        return {
            status: 404,
            message: "The requested resource was not found.",
            url: isDev ? http.req.url : undefined
        }
    }
};
