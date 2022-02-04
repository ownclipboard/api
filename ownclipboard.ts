import { $ } from "./xpresser";

// Setup folder structure.
$.on.bootServer(require("./backend/FolderSetup"));

// Boot Server.
$.boot();
