import { LoadEnv } from "@xpresser/env";

// Declare envFile path.
let envFile = __dirname + "/.env";

// if running in js mood .env will be two levels behind in folder structure.
if (__filename.includes(".js")) {
    envFile = __dirname + "/../.env";
}

// Declare type for env
type env = {
    NODE_ENV: string;
    SECRET_KEY: string;
    APP_PORT: string;
    APP_DOMAIN: string;
    APP_PROTOCOL: string;
    APP_PREVIEW: string;
    APP_PREVIEW_URL: string;

    DATABASE_SERVER: string;
    DATABASE_NAME: string;
    DATABASE_PASSWORD: string;
};

// Load Env
const env = LoadEnv<env>(envFile, {
    castBoolean: true,
    required: [
        "NODE_ENV",
        "SECRET_KEY",
        "APP_PORT",
        "APP_DOMAIN",
        "APP_PROTOCOL",
        "DATABASE_SERVER",
        "DATABASE_NAME",
        "DATABASE_PASSWORD"
    ]
});

// Declare isDev
const isDev = env.NODE_ENV === "development";
const isProd = env.NODE_ENV === "production";

// Export variables;
export { env, isDev, isProd };
