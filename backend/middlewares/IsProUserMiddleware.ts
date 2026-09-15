import { Http } from "xpresser/types/http";
import Subscription from "../models/Subscription";
import User from "../models/User";

/**
 * IsProUserMiddleware
 * Allows only users with an active, unexpired Pro subscription (trial or paid).
 * Must run after `Auth.validateToken`.
 *
 * Usage:
 *  - Route:      .middlewares(["Auth.validateToken", "IsProUser"])
 *  - Controller: middlewares: { IsProUser: "update" }
 */
export = {
    /**
     * Default action (used when referenced as "IsProUser").
     * @param {Xpresser.Http} http
     */
    async allow(http: Http) {
        const user = http.authData();

        if (!user) return http.error("Authentication required.", 401);

        const message = "This feature is only available to Pro users.";

        // Cheap check first.
        if (user.plan !== "pro") return http.error(message, 403, { plan: user.plan ?? "free" });

        // Confirm there is still an unexpired subscription.
        const current = await Subscription.findCurrentForUser(user._id);

        if (!current) {
            // Subscription has expired, downgrade now instead of waiting for the expiry job.
            await User.native().updateOne({ _id: user._id, plan: "pro" }, { $set: { plan: "free" } });
            user.plan = "free";

            return http.error("Your Pro subscription has expired.", 403, { plan: "free", expired: true });
        }

        return http.next();
    }
};
