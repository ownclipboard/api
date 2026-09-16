import { Controller, Http } from "xpresser/types/http";
import User from "../models/User";
import Subscription from "../models/Subscription";
import { owns3Summary } from "../lib/Owns3";
import { realtimeEnabled, userChannel } from "../lib/Realtime";

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
     * @openapi
     * /client/v1/ping:
     *   get:
     *     tags: [Account]
     *     summary: Current user, storage and subscription
     *     description: |
     *       Returns the authenticated user's public profile, their latest active subscription and a
     *       short view of their file storage, so the client can decide whether to offer uploads,
     *       plus `realtime`, which says whether live updates are available and names the channel
     *       to subscribe to after fetching a token from `POST /client/v1/realtime/token`.
     *       `storage.connected` is true when files can be uploaded now. `storage.default` says the
     *       app's own storage is in use, `storage.defaultAvailable` whether it is offered at all,
     *       and `storage.proRequired` appears when the default storage is picked but the Pro plan
     *       has lapsed. The full connection details live at `GET /client/v1/account/owns3`.
     *     security: [{ ocToken: [] }]
     *     responses:
     *       200:
     *         description: Authenticated user.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/PingResponse" }
     *       401:
     *         description: Missing or invalid `oc-token`.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
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
                // `owns3` is fetched for the storage summary below, never returned as is.
                projection: User.projectPublicFields(["owns3"])
            });
        }

        const sub = await Subscription.findOne({
            userId: authId,
            status: "active"
            // no expiresAt used because we want to get the last
            // subscription even if it has expired.
            // expiresAt: { $gt: new Date() }
        }, { sort: { createdAt: -1 } });

        // File storage, so the client knows whether uploads are available.
        const storage = owns3Summary(user?.data.owns3, user?.data.plan);

        if (user) delete (user.data as any).owns3;

        // Live updates: whether this server has them, and the channel to listen on.
        const enabled = realtimeEnabled();
        const realtime = {
            enabled,
            channel: enabled && user ? userChannel(user.data.publicId) : null
        };

        // Return only public fields
        return { user, storage, realtime, subscription: sub?.toStat() };
    }
};
