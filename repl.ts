import type { DollarSign } from "xpresser/types";

const { XpresserRepl } = require("xpresser");
const repl = new XpresserRepl();

/**
 * Provide Xpresser
 */
repl.setXpresserProvider(() => {
    // Set global repl.
    Object.defineProperty(global, "IS_XPRESSER_REPL", { value: true });

    // Get Xpresser
    const { $ } = require("./xpresser") as { $: DollarSign };
    return $;
});

/**
 * Run some tasks or add context before repl starts
 * repl.server is undefined.
 * @param $ - Current Xpresser Instance
 */
repl.beforeStart(($: DollarSign) => {
    // Add Models
    repl.addContextFromFolder(
        $.path.models(),
        null,
        null,
        // This function checks if using `export default Model` or `export = Model`
        (context: any) => {
            return context.default ? context.default : context;
        }
    );
});

/**
 * Start Repl Server.
 * Function will run after repl server starts.
 * @param $ - Current Xpresser Instance
 */
repl.start(() => {
    // repl.server is now defined.
    // Any Customization to the repl server `repl.server` directly can be done here.
}).catch(console.error);
