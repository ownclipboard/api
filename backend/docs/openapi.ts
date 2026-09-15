import path from "path";
import swaggerJsdoc from "swagger-jsdoc";
import { createGenerator } from "ts-json-schema-generator";
import { env } from "../../env";

const ROOT = path.resolve(__dirname, "../..");

/**
 * Convert every exported type in `backend/types/api.ts` to JSON schema,
 * rewritten so `$ref`s point at `#/components/schemas/*`.
 */
export function buildSchemas(): Record<string, any> {
    const schema = createGenerator({
        path: path.join(ROOT, "backend/types/api.ts"),
        tsconfig: path.join(ROOT, "tsconfig.json"),
        type: "*",
        expose: "export",
        jsDoc: "extended",
        skipTypeCheck: true,
        topRef: true
    }).createSchema("*");

    const json = JSON.stringify(schema.definitions ?? {}).replace(
        /#\/definitions\//g,
        "#/components/schemas/"
    );

    return JSON.parse(json);
}

/**
 * Build the OpenAPI document from the `@openapi` JSDoc blocks in the
 * controllers plus the generated schemas.
 */
export function buildOpenApiSpec(): Record<string, any> {
    return swaggerJsdoc({
        definition: {
            openapi: "3.1.0",
            info: {
                title: "OwnClipboard API",
                version: "1.0.0",
                description:
                    "Client API for OwnClipboard. Authenticated endpoints expect the JWT from `/auth/login` in the `oc-token` header."
            },
            servers: [{ url: env.WEBHOOK_URL, description: "This server" }],
            tags: [
                { name: "Auth", description: "Login and registration." },
                { name: "Account", description: "Profile and plan." },
                { name: "Subscription", description: "Pro plan subscriptions paid through NowPayments." },
                { name: "Folders", description: "Folders that group clips." },
                { name: "Clips", description: "Clipboard contents." },
                { name: "Devices", description: "Api keys used by external apps through the legacy api." },
                { name: "Files", description: "Files stored on the user's own owns3 server, represented as file clips." },
                { name: "Public", description: "Endpoints that need no authentication (public paste)." },
                {
                    name: "Legacy",
                    description:
                        "Api of the first OwnClipboard platform, served at `/api/legacy/*` so existing apps keep working. Authenticated with a device api key sent as the `oc-key` header, an `api_key` query param or an `api_key` body field, never with the jwt."
                }
            ],
            components: {
                securitySchemes: {
                    ocToken: {
                        type: "apiKey",
                        in: "header",
                        name: "oc-token",
                        description:
                            "JWT returned by `POST /client/v1/auth/login`. The old `oc_token` spelling is still accepted but is dropped by nginx, which strips headers containing underscores."
                    }
                },
                schemas: buildSchemas()
            }
        },
        apis: [path.join(ROOT, "backend/controllers/**/*.ts")],
        failOnErrors: true
    }) as Record<string, any>;
}
