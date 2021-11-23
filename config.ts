/**
 * Your Config File.
 * See https://xpresserjs.com/configuration/
 */
import { env } from "./env";

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

    packages: {
        "body-parser": {
            json: { limit: "50mb", extended: true },
            urlencoded: { limit: "50mb", extended: true }
        }
    }
};
