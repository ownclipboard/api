import { Http } from "xpresser/types/http";
import { verifyJwt } from "@xpresser/jwt";
import User from "../models/User";
import { $ } from "../../xpresser";
import { ObjectId } from "xpress-mongo";
import { AuthData } from "../types/models";

/**
 * AuthMiddleware
 */
export = {
    /**
     * Default Middleware Action
     * @param {Xpresser.Http} http
     */
    async validateToken(http: Http) {
        // Get token from header.
        // `oc_token` is the old spelling, still read so clients can catch up.
        // Nginx drops headers containing underscores, so `oc-token` is the one to use.
        const token = http.req.headers["oc-token"] || http.req.headers["oc_token"];

        // Check if token exists
        if (!token)
            return http.status(401).send({
                error: "Header: {oc-token} is required for this endpoint!"
            });

        // validate token
        try {
            const data = verifyJwt(token as string);

            // Decode authId
            let authId: string | ObjectId = $.base64.decode(data.id);
            authId = User.id(authId); // convert to ObjectId

            const user = await User.findById(authId);

            if (!user)
                return http.badRequestError("Account Not Found!");

            // compare login token
            if (user.data.loginToken !== data.loginToken)
                return http.badRequestError("Session Expired!, Please Login Again!");


            http.state.set("authData", <AuthData>{
                _id: authId,
                username: user.data.username,
                publicId: user.data.publicId,
                plan: user.data.plan
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
