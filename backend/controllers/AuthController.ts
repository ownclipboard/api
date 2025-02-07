import { Controller, Http } from "xpresser/types/http";
import bcrypt from "bcryptjs";
import User, { UserDataType } from "../models/User";
import { pickKeys, XMongoDataType } from "xpress-mongo";
import { signJwt } from "@xpresser/jwt";
import { $ } from "../../xpresser";
import { Abolish, compileSchemaT } from "abolish";
import { isPasswordRequired, isUsername } from "../abolish/reusables";


const LoginSchema = compileSchemaT({
    username: [isUsername, "UsernameExists"],
    password: isPasswordRequired
})

const SignupSchema = compileSchemaT({
    username: [isUsername, "!UsernameExists"],
    password: isPasswordRequired
})

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
     * Login with username & password.
     * @param http - Current Http Instance
     * @param boot - Boot return data.
     * @param e - error handler
     */
    async login(http, _, e) {
        type body = { username: string; password: string };
        const [err, body] = http.validateBody<body>(LoginSchema);
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
     * Register with username & password.
     */
    async signup(http) {
        // Get abolish validated body
        type body = { username: string; password: string };

        const [err, body] = http.validateBody<body>(SignupSchema);
        if (err) return http.abolishError(err);

        const { username, password } = body;

        // Make new user
        const user = User.make(<UserDataType>{ username });

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
