import { Controller, Http } from "xpresser/types/http";

/**
 * ContentController
 */
export = <Controller.Object>{
    // Controller Name
    name: "Client/ContentController",

    // Controller Default Error Handler.
    e: (http: Http, error: string) => http.status(401).json({ error }),

    middlewares: {
        // Use Abolish to validate all request body.
        Abolish: "*"
    },

    /**
     * Example Action.
     * @param http - Current Http Instance
     */
    paste(http) {
        type body = { title?: string; content: string };
        const body = http.validatedBody<body>();

        return { body };
    }
};
