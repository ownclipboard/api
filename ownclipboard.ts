import { $ } from "./xpresser";

// Setup folder structure.
$.on.bootServer(require("./backend/FolderSetup"));

// Serve api docs at /docs (expressInit runs before routes, so the 404 catch-all does not shadow it)
$.on.expressInit(require("./backend/docs/DocsSetup"));

// Boot Server.
$.boot();
