/**
 * Your Config File.
 * See https://xpresserjs.com/configuration/
 */
import { env } from "./env";
import { parseServerUrl } from "xpress-mongo";
import ReadableTimeout from "readable-timeout";

export = {
    // name of app
    name: "Ownclipboard Api",

    // app environment
    env: env.NODE_ENV,

    /**
     * By default xpresser sets this for you.
     */
    server: {
        domain: env.APP_DOMAIN,
        // Server Port
        port: env.APP_PORT
    },

    /**
     * Path settings.
     */
    paths: {
        /**
         * Base Folder
         * Where this app is called from.
         *
         * Best value for this is: __dirname
         */
        base: __dirname,

        /**
         * Point routes file to routes.ts
         */
        routesFile: "backend://routes.ts"
    },

    /**
     * If Enabled, xjs make:model will generate Models
     * that requires you to define all data types.
     */
    useStrictTypescriptModels: true, // >=v1.0.0

    // Mongodb Connection Config
    mongodb: {
        url: parseServerUrl(env.DATABASE_SERVER, { password: env.DATABASE_PASSWORD }),
        database: env.DATABASE_NAME
    },

    // Jwt Settings
    "@xpresser/jwt": {
        secretKey: env.SECRET_KEY,
        signer: {
            expiresIn: ReadableTimeout.msIn("1 day")
        },
        verifier: { cache: true }
    },

    packages: {
        "body-parser": {
            json: { limit: "50mb", extended: true },
            urlencoded: { limit: "50mb", extended: true }
        }
    }
};
