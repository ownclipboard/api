import { Controller, Http } from "xpresser/types/http";
import bcrypt from "bcryptjs";
import User, { UserDataType } from "../models/User";
import { pickKeys, XMongoDataType } from "xpress-mongo";
import { signJwt } from "@xpresser/jwt";
import { $ } from "../../xpresser";
import { Abolish, compileSchemaT } from "abolish";
import { isEmailRequired, isPasswordRequired, isUsername } from "../abolish/reusables";
import { skipIfUndefined } from "abolish/src/helpers";


const LoginSchema = compileSchemaT({
    username: [isUsername, "UsernameExists"],
    password: isPasswordRequired
})

// Not compiled: compiled schemas drop `string:trim` modifiers before the next validator runs,
// which makes " a@b.com " fail the email check.
const SignupSchema = {
    username: [isUsername, "!UsernameExists"],
    password: isPasswordRequired,
    // Optional, kept for password resets. Trimmed and lower-cased.
    email: skipIfUndefined(isEmailRequired)
};

const CheckUsernameSchema = compileSchemaT({
    username: isUsername
})


/**
 * AuthController
 * All auth related actions are declared here.
 */
export = <Controller.Object>{
    // Controller Name
    name: "AuthController",

    // Controller Default Error Handler.
    e: (http: Http, error: string) => http.status(401).json({ error }),

    middlewares: {
        // Use Abolish to validate all request body.
        Abolish: "*"
    },

    /**
     * @openapi
     * /client/v1/auth/login:
     *   post:
     *     tags: [Auth]
     *     summary: Login
     *     description: Returns a JWT. Send it as the `oc-token` header on authenticated requests.
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/LoginBody" }
     *           example: { username: alice, password: secret123 }
     *     responses:
     *       200:
     *         description: Logged in.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/LoginResponse" }
     *       400:
     *         description: Validation error or unknown username.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       401:
     *         description: Wrong password.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Login with username & password.
     * @param http - Current Http Instance
     * @param boot - Boot return data.
     * @param e - error handler
     */
    async login(http, _, e) {
        type body = { username: string; password: string };

        const [err, body] = await http.validateBodyAsync<body>(LoginSchema);
        if (err) return http.abolishError(err);


        // Get abolish validated body
        const { username, password } = body;

        // Get user and password from db
        const user = (await User.findOne({ username }, { projection: pickKeys(["password", "loginToken", "plan"]) }))!;

        // check password
        if (!bcrypt.compareSync(password, user.data.password)) return e("Password is incorrect!");

        let loginToken = user.data.loginToken;

        // If no login token, for some reason, create one.
        if (!loginToken) {
            loginToken = (User.schema.loginToken as XMongoDataType).schema.default();
            await user.update({ loginToken });
        }

        // Create Jwt Token
        const token = signJwt({
            id: $.base64.encode(user.id().toString()),
            username: user.data.username,
            loginToken
        });

        return {
            token,
            plan: user.data.plan ?? null
        };
    },

    /**
     * @openapi
     * /client/v1/auth/signup:
     *   post:
     *     tags: [Auth]
     *     summary: Sign up
     *     description: |
     *       Creates an account with the default `Clipboard` and `Encrypted` folders.
     *       `email` is optional, must be unique, and is kept for password resets.
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/SignupBody" }
     *           example: { username: alice, password: secret123, email: alice@example.com }
     *     responses:
     *       200:
     *         description: Account created.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/MessageResponse" }
     *       400:
     *         description: Validation error, username already taken, or email already in use.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Register with username & password.
     */
    async signup(http) {
        // Get abolish validated body
        type body = { username: string; password: string; email?: string };

        const [err, body] = await http.validateBodyAsync<body>(SignupSchema);
        if (err) return http.abolishError(err);

        const { username, password, email } = body;

        // Email must be unique across accounts (it will be used for password resets).
        if (email && (await User.exists({ email }))) {
            return http.error("Email is already associated with another account.", 400, { field: "email" });
        }

        // Make new user
        const user = User.make(<UserDataType>{ username, ...(email ? { email } : {}) });

        // Hash password
        user.data.password = bcrypt.hashSync(password, 10);

        // Save new user
        await user.save();

        // Create Default Folders
        await user.createDefaultFolders();

        return { message: "Signup successful." };
    },

    /**
     * Validate Api Key.
     * @param http
     */
    apiKey(http) {
        return { message: "Apikey is valid!" };
    },

    /**
     * @openapi
     * /client/v1/auth/check-username:
     *   post:
     *     tags: [Auth]
     *     summary: Check whether a username is taken
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/CheckUsernameBody" }
     *     responses:
     *       200:
     *         description: Lookup result.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/CheckUsernameResponse" }
     *       400:
     *         description: Invalid username.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * @openapi
     * /client/v1/auth/logout:
     *   post:
     *     tags: [Auth]
     *     summary: Log out
     *     description: |
     *       Ends every session of the account, on every device. The jwt carries a login token
     *       that is compared on each request, and this endpoint replaces it, so all tokens
     *       issued so far stop working. The client should discard its own token as well.
     *     security: [{ ocToken: [] }]
     *     responses:
     *       200:
     *         description: Logged out.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/MessageResponse" }
     *       400:
     *         description: Invalid or already ended session.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       401:
     *         description: Missing `oc-token`.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Log out of every device by rotating the account's login token.
     */
    async logout(http) {
        // A fresh login token invalidates every jwt issued so far.
        const loginToken = (User.schema.loginToken as XMongoDataType).schema.default();

        await User.native().updateOne({ _id: http.authUserId() }, { $set: { loginToken } });

        return { message: "Logged out of all devices." };
    },

    /**
     * Check validity of username.
     * @param http
     */
    async checkUsername(http) {
        type body = { username: string };

        const [err, body] = http.validateBody<body>(CheckUsernameSchema);
        if (err) return http.abolishError(err);

        // Check if username exists
        const exists = await Abolish.testAsync(body.username, "UsernameExists");

        // Return response
        return { exists };
    }
};
