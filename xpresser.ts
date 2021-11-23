// Import Xpresser
import { init } from "xpresser";
import { Options } from "xpresser/types";
import config from "./config";

/**
 * Set repl options.
 */
let replOptions: Options = {};
if (global.hasOwnProperty("IS_XPRESSER_REPL")) {
    replOptions = { requireOnly: true, isConsole: true };
}

// Initialize Xpresser
const $ = init(config, { exposeDollarSign: false, ...replOptions });

// Initialize Typescript
$.initializeTypescript(__filename);

// Export Xpresser Instance
export { $ };
