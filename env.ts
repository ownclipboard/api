import { Env } from "@xpresser/env";

// Declare envFile path.
let envFile = __dirname + "/.env";

// if running in js mood .env will be two levels behind in folder structure.
if (__filename.includes(".js")) {
    envFile = __dirname + "/../.env";
}


const env = Env(envFile, {
    NODE_ENV: Env.is.enum(["development", "production"], "development"),
    SECRET_KEY: Env.is.string(),

    APP_PORT: Env.is.string("3003"),
    APP_DOMAIN: Env.is.string("localhost"),
    APP_PROTOCOL: Env.is.string("http"),
    APP_PREVIEW: Env.is.boolean(false),
    APP_PREVIEW_URL: Env.optional.string("clip.ngrok.io"),

    DATABASE_SERVER: Env.is.string("mongodb://localhost:27017"),
    DATABASE_NAME: Env.is.string("ownclipboard"),
    DATABASE_PASSWORD: Env.optional.string(),

    // NowPayments (https://nowpayments.io)
    NOW_PAYMENTS_API_KEY: Env.is.string(),
    // IPN secret from the NowPayments dashboard (Settings > Payments > IPN secret key).
    // Used to verify the signature of every webhook call.
    NOW_PAYMENTS_IPN_SECRET: Env.is.string(),
    // When true, requests go to api-sandbox.nowpayments.io (use a sandbox api key).
    NOW_PAYMENTS_SANDBOX: Env.is.boolean(false),

    WEBHOOK_URL: Env.is.string("http://localhost:3003"),
    FRONTEND_URL: Env.is.string("http://localhost:3000"),

    // Default owns3 server (https://github.com/ownclipboard/owns3) offered to users who
    // do not want to connect their own. Leave empty to disable the option.
    // The key must carry read, write and delete permissions.
    OWNS3_DEFAULT_ENDPOINT: Env.optional.string(),
    OWNS3_DEFAULT_API_KEY: Env.optional.string(),

    // Ably (https://ably.com) powers realtime clip notifications.
    // Leave empty to run without realtime: clients simply poll as before.
    ABLY_API_KEY: Env.optional.string(),
})

// Declare isDev
const isDev = env.NODE_ENV === "development";
const isProd = env.NODE_ENV === "production";

// Export variables;
export { env, isDev, isProd };
