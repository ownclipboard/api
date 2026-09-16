import type { Controller, Http } from "xpresser/types/http";
import { createRealtimeToken, realtimeEnabled, userChannel } from "../../lib/Realtime";

/**
 * RealtimeController
 * Hands the client a short lived Ably token so it can listen on its own channel.
 * The Ably api key stays on this server.
 */
export = <Controller.Object>{
    // Controller Name
    name: "Client/RealtimeController",

    // Controller Default Error Handler.
    e: (http: Http, error: string) => http.status(401).json({ error }),

    /**
     * @openapi
     * /client/v1/realtime/token:
     *   post:
     *     tags: [Realtime]
     *     summary: Token to listen for live updates
     *     description: |
     *       Returns a signed Ably TokenRequest. Point the Ably SDK's `authUrl` at this endpoint
     *       with `authMethod: "POST"` and the `oc-token` header, and it fetches and renews tokens
     *       on its own. The response body is the TokenRequest itself, as the SDK expects.
     *
     *       The token may only **subscribe**, and only to the user's own channel,
     *       `user:{publicId}`, which `GET /client/v1/ping` reports as `realtime.channel`.
     *       It can neither publish nor listen to anyone else.
     *
     *       Messages carry ids and folder slugs only, never clip content: on an event the
     *       client refetches over this api. Event names are `clip.new`, `clip.updated`,
     *       `clip.deleted` and `clips.changed`, the last one for bulk changes such as a move
     *       or a folder being deleted.
     *     security: [{ ocToken: [] }]
     *     responses:
     *       200:
     *         description: Ably TokenRequest, pass it straight to the SDK.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/RealtimeTokenResponse" }
     *       401:
     *         description: Missing or invalid `oc-token`.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       503:
     *         description: Realtime is not configured on this server.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Signed Ably token request, scoped to the user's own channel.
     */
    async token(http) {
        if (!realtimeEnabled()) {
            return http.error("Realtime is not available on this server.", 503);
        }

        const { publicId } = http.authData();

        try {
            const tokenRequest = await createRealtimeToken(publicId);
            if (!tokenRequest) return http.error("Realtime is not available on this server.", 503);

            // The Ably SDK expects the token request as the whole response body.
            return tokenRequest;
        } catch (e: any) {
            console.error("[realtime] token:", e.message);
            return http.error("Could not create a realtime token.", 503);
        }
    }
};
