import { Http } from "xpresser/types/http";
import { verifyJwt } from "@xpresser/jwt";
import User from "../models/User";
import { $ } from "../../xpresser";
import { ObjectId } from "xpress-mongo";

/**
 * AuthMiddleware
 */
export = {
    /**
     * Default Middleware Action
     * @param {Xpresser.Http} http
     */
    async validateToken(http: Http): Promise<any> {
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
            let authId: string | ObjectId = $.base64.decode(data.id);
            authId = User.id(authId); // convert to ObjectId

            const user = await User.findOne({ _id: authId });

            if (!user)
                return http.status(401).send({
                    error: "Invalid Auth Account!"
                });

            // Set auth.userId to state.
            http.state.set("auth.userId", authId);
            http.state.set("authData", {
                id: authId,
                username: user.data.username
            });

            // Add to boot for easy controller access.
            http.addToBoot("authId", authId);

            // Continue
            return http.next();
        } catch (e: any) {
            return http.status(401).json({ error: "Invalid Auth Token!" });
        }
    }
};
