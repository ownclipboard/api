import { Http } from "xpresser/types/http";
import { verifyJwt } from "@xpresser/jwt";
import User from "../models/User";
import { $ } from "../../xpresser";

/**
 * AuthMiddleware
 */
export = {
    /**
     * Default Middleware Action
     * @param {Xpresser.Http} http
     */
    validateToken(http: Http): any {
        // Get token from header
        const { oc_token } = http.req.headers;

        // Check if token exists
        if (!oc_token)
            return http.status(401).send({
                error: "Header: {oc_token} is required for this endpoint!"
            });

        // validate token
        try {
            const data = verifyJwt(oc_token as string);

            // Decode authId
            const authId = $.base64.decode(data.id);

            // Set auth.userId to state.
            http.state.set(
                "auth.userId",
                User.id(authId) // convert to ObjectId
            );

            // Continue
            return http.next();
        } catch (e: any) {
            return http.status(401).json({ error: "Invalid Auth Token!" });
        }
    }
};
