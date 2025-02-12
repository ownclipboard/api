import { Controller, Http } from "xpresser/types/http";
import User from "../models/User";
import Subscription from "../models/Subscription";

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

        const sub = await Subscription.findOne({
            userId: authId,
            status: "active"
            // no expiresAt used because we want to get the last
            // subscription even if it has expired.
            // expiresAt: { $gt: new Date() }
        }, { sort: { createdAt: -1 } });

        // Return only public fields
        return { user, subscription: sub?.toStat() };
    }
};
