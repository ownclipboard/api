import { TodoFunction } from "xpresser/types";
import swaggerUi from "swagger-ui-express";
import { isDev } from "../../env";
import { buildOpenApiSpec } from "./openapi";
import generatedSpec from "./openapi.json";

/**
 * Serve the OpenAPI docs.
 *  - GET /docs       Swagger UI
 *  - GET /docs.json  raw OpenAPI document
 *
 * In development the document is rebuilt from source on every boot so
 * comment edits show up immediately. In production the prebuilt
 * backend/docs/openapi.json is served (see `npm run docs:build`).
 */
export = ((next, $) => {
    let spec: Record<string, any> = generatedSpec;

    if (isDev) {
        try {
            spec = buildOpenApiSpec();
        } catch (e: any) {
            $.logError(`Api docs: failed to build from source, serving openapi.json. ${e.message}`);
        }
    }

    $.app!.get("/docs.json", (_req, res) => res.json(spec));
    // Cast: swagger-ui-express ships its own express typings which differ from xpresser's.
    $.app!.use(
        "/docs",
        swaggerUi.serve as any,
        swaggerUi.setup(spec, { customSiteTitle: "OwnClipboard API Docs" }) as any
    );

    $.logSuccess("Api docs: /docs");

    return next();
}) as TodoFunction;
