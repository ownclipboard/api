/**
 * Generate backend/docs/openapi.json from the controllers' `@openapi`
 * JSDoc blocks and the public types in backend/types/api.ts.
 *
 * Run: npm run docs:build
 * The JSON is what production serves at /docs, because tsc strips comments.
 */
import fs from "fs";
import path from "path";
import { buildOpenApiSpec } from "../backend/docs/openapi";

const out = path.resolve(__dirname, "../backend/docs/openapi.json");
const spec = buildOpenApiSpec();

fs.writeFileSync(out, JSON.stringify(spec, null, 2) + "\n");

const paths = Object.keys(spec.paths ?? {});
const schemas = Object.keys(spec.components?.schemas ?? {});
console.log(`OpenAPI written to ${path.relative(process.cwd(), out)}: ${paths.length} path(s), ${schemas.length} schema(s).`);
