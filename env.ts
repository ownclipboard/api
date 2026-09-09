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
})

// Declare isDev
const isDev = env.NODE_ENV === "development";
const isProd = env.NODE_ENV === "production";

// Export variables;
export { env, isDev, isProd };
