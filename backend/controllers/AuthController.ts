import { Controller, Http } from "xpresser/types/http";
import bcrypt from "bcryptjs";
import User, { UserDataType } from "../models/User";
import { pickKeys } from "xpress-mongo";
import { signJwt } from "@xpresser/jwt";
import { $ } from "../../xpresser";
import { Abolish } from "abolish";

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
    async login(http, boot, e) {
        // Get abolish validated body
        const { username, password } = http.validatedBody<{ username: string; password: string }>();

        // Get user  and password from db
        const user = (await User.findOne({ username }, { projection: pickKeys(["password"]) }))!;

        // check password
        if (!bcrypt.compareSync(password, user.data.password)) return e("Password is incorrect!");

        // Create Jwt Token
        const token = signJwt({
            id: $.base64.encode(user.id().toString())
        });

        return { token };
    },

    /**
     * Register with username & password.
     */
    async signup(http) {
        // Get abolish validated body
        type body = { username: string; password: string };
        const { username, password } = http.validatedBody<body>();

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
        // Get abolish validated body
        const { username } = http.validatedBody<{ username: string }>();

        // Check if username exists
        const exists = await Abolish.testAsync(username, "UsernameExists");

        // Return response
        return { exists };
    }
};
