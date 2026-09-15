import type { Controller, Http } from "xpresser/types/http";
import { compileSchemaT } from "abolish";
import bcrypt from "bcryptjs";
import { pickKeys, XMongoDataType } from "xpress-mongo";
import { signJwt } from "@xpresser/jwt";
import { $ } from "../../../xpresser";
import User, { UserDataType } from "../../models/User";
import Subscription from "../../models/Subscription";
import { isEmailRequired, isPasswordRequired } from "../../abolish/reusables";

const SetPlanSchema = compileSchemaT({
    plan: { required: true, string: true, inArray: ["free", "pro"] }
});

// Not compiled: compiled schemas drop `string:trim` modifiers before the next validator runs,
// which makes " a@b.com " fail the email check.
const SetEmailSchema = {
    email: isEmailRequired,
    password: isPasswordRequired
};

const ChangePasswordSchema = {
    currentPassword: isPasswordRequired,
    newPassword: isPasswordRequired
};


/**
 * AccountController
 */
export = <Controller.Object>{
    // Controller Name
    name: "AccountController",

    // Controller Default Error Handler.
    e: (http: Http, error: string) => http.status(401).json({ error }),


    /**
     * @openapi
     * /client/v1/account/set-plan:
     *   post:
     *     tags: [Account]
     *     summary: Set plan
     *     description: |
     *       Sets the user's plan. Choosing `pro` creates a one month trial subscription.
     *       Paid Pro time is bought through `/client/v1/account/subscribe`.
     *     security: [{ ocToken: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/SetPlanBody" }
     *           example: { plan: pro }
     *     responses:
     *       200:
     *         description: Plan updated.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/MessageResponse" }
     *       400:
     *         description: Validation error or plan already set.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       401:
     *         description: Missing or invalid `oc-token`.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Set Plan
     * @param http - Current Http Instance
     */
    async setPlan(http) {
        type body = { plan: UserDataType["plan"] };
        const [err, body] = http.validateBody<body>(SetPlanSchema);
        if (err) return http.abolishError(err);

        const user = http.authData();

        if (user.plan === body.plan) {
            return http.badRequestError("Plan is already set to " + body.plan);
        }


        // if plan is pro, then it is try pro
        // create subscription
        if(body.plan === "pro") {
            const sub =  Subscription.create(user._id, "pro", "trial", 0, 1)
            sub.data.status = "active";
            await sub.save()
        }


        await User.native().updateOne(
            { _id: user._id },
            { $set: { plan: body.plan } }
        );


        return { message: "Plan updated successfully!" };
    },

    /**
     * @openapi
     * /client/v1/account/set-email:
     *   post:
     *     tags: [Account]
     *     summary: Set or change the account email
     *     description: |
     *       Adds an email to an account that has none, or replaces the one it has. The account
     *       password is required, because the address is what a future password reset is sent to.
     *       The address is trimmed, lower-cased and must not belong to another account.
     *       It is not verified, so treat it as unconfirmed until a verification flow exists.
     *     security: [{ ocToken: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/SetEmailBody" }
     *           example: { email: alice@example.com, password: secret123 }
     *     responses:
     *       200:
     *         description: Email saved.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/SetEmailResponse" }
     *       400:
     *         description: Validation error, wrong password, or the address belongs to another account.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       401:
     *         description: Missing or invalid `oc-token`.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Set or change the account email. Requires the account password.
     */
    async setEmail(http) {
        type body = { email: string; password: string };

        const [err, body] = await http.validateBodyAsync<body>(SetEmailSchema);
        if (err) return http.abolishError(err);

        const { email, password } = body;
        const userId = http.authUserId();

        const user = (await User.findById(userId, {
            projection: pickKeys(["password", "email"])
        }))!;

        if (!bcrypt.compareSync(password, user.data.password)) {
            return http.error("Password is incorrect!", 400, { field: "password" });
        }

        if (user.data.email === email) {
            return http.error("This is already your email address.", 400, { field: "email" });
        }

        // The address may not belong to anyone else.
        if (await User.exists({ email })) {
            return http.error("Email is already associated with another account.", 400, {
                field: "email"
            });
        }

        await User.native().updateOne({ _id: userId }, { $set: { email } });

        return { email, message: "Email saved." };
    },

    /**
     * @openapi
     * /client/v1/account/change-password:
     *   post:
     *     tags: [Account]
     *     summary: Change the account password
     *     description: |
     *       Replaces the password. The current one is required. Every other session is ended,
     *       so a new token is returned for the caller: replace the stored `oc-token` with it,
     *       otherwise the next request fails with a session error.
     *     security: [{ ocToken: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/ChangePasswordBody" }
     *           example: { currentPassword: secret123, newPassword: evenbetter456 }
     *     responses:
     *       200:
     *         description: Password changed, with a fresh token.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ChangePasswordResponse" }
     *       400:
     *         description: Validation error, wrong current password, or the new password is the same.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       401:
     *         description: Missing or invalid `oc-token`.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Change the password, then end every other session.
     */
    async changePassword(http) {
        type body = { currentPassword: string; newPassword: string };

        const [err, body] = await http.validateBodyAsync<body>(ChangePasswordSchema);
        if (err) return http.abolishError(err);

        const { currentPassword, newPassword } = body;
        const userId = http.authUserId();

        const user = (await User.findById(userId, {
            projection: pickKeys(["password", "username"])
        }))!;

        if (!bcrypt.compareSync(currentPassword, user.data.password)) {
            return http.error("Password is incorrect!", 400, { field: "currentPassword" });
        }

        if (currentPassword === newPassword) {
            return http.error("New password must be different from the current one.", 400, {
                field: "newPassword"
            });
        }

        // A fresh login token invalidates every jwt issued so far, this one included.
        const loginToken = (User.schema.loginToken as XMongoDataType).schema.default();

        await User.native().updateOne(
            { _id: userId },
            { $set: { password: bcrypt.hashSync(newPassword, 10), loginToken } }
        );

        // Keep the caller signed in with a token carrying the new login token.
        const token = signJwt({
            id: $.base64.encode(userId.toString()),
            username: user.data.username,
            loginToken
        });

        return {
            token,
            message: "Password changed. Other devices have been signed out."
        };
    }
};
