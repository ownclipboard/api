import EnvLoader from "@xpresser/env";

// Declare envFile path.
let envFile = __dirname + "/.env";

// if running in js mood .env will be too levels behind.
if (__filename.includes(".js")) {
    envFile = __dirname + "/../.env";
}

// Load Env
const env = EnvLoader(envFile, {
    castBoolean: true,
    required: [
        "NODE_ENV",
        "APP_PORT",
        "APP_DOMAIN",
        "APP_PROTOCOL",
        "APP_PREVIEW",
        "APP_PREVIEW_URL"
    ]
});

// Declare type for env
type env = {
    NODE_ENV: string;
    APP_PORT: string;
    APP_DOMAIN: string;
    APP_PROTOCOL: string;
    APP_PREVIEW: string;
    APP_PREVIEW_URL: string;
};

// Declare isDev
const isDev = env.NODE_ENV === "development";
const isProd = env.NODE_ENV === "production";

// Export variables;
export { env, isDev, isProd };
