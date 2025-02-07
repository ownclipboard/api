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
    async validateToken(http: Http) {
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

            const user = await User.findById(authId);

            if (!user)
                return http.badRequestError("Account Not Found!");


            // compare login token
            if (user.data.loginToken !== data.loginToken)
                return http.badRequestError("Session Expired!, Please Login Again!");


            http.state.set("authData", {
                id: authId,
                username: user.data.username,
                publicId: user.data.publicId
            });

            // Add to boot for easy controller access.
            http.addToBoot("authId", authId);

            // Continue
            return http.next();
        } catch (e: any) {
            return http.badRequestError("Invalid Auth Token!");
        }
    }
};
