import { Controller, Http } from "xpresser/types/http";
import User from "../models/User";

/**
 * ClientController
 */
export = <Controller.Object>{
    // Controller Name
    name: "ClientController",

    // Controller Default Error Handler.
    e: (http: Http, error: string) => http.status(401).json({ error }),

    middlewares: {
        "Auth.validateToken": "ping"
    },

    /**
     * Ping
     * @param http - Current Http Instance
     */
    async ping(http) {
        const authId = http.authUserId();
        let user: User | null = null;

        // Find User using authId
        if (authId) {
            user = await User.findById(authId, {
                projection: User.projectPublicFields()
            });
        }

        // Return only public fields
        return { user };
    }
};
