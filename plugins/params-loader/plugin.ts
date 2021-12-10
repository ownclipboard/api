/**
 * Xpresser Params Loader Plugin
 */
import { DollarSign, PluginData } from "xpresser/types";
import { Abolish } from "abolish";
import { $inline } from "abolish/src/Functions";

export function run(plugin: PluginData, $: DollarSign) {
    // Stop this is xpresser's native command!
    if ($.isNativeCliCommand()) return false;

    /**
     * Load params from file on server start
     */
    $.on.bootServer((next) => {
        // Validate config file using abolish.
        const [e, validatedConfig] = Abolish.validate(
            // Plugin config
            $.config.get("paramsLoader", {}),

            // Rules
            {
                enabled: {
                    default: true,
                    typeof: "boolean",
                    $name: "{enabled}"
                },
                paramsFile: {
                    default: "backend://ParamsLoader",
                    typeof: "string",
                    $name: "{paramsFile}",
                    ...$inline((file: string, { error }) => {
                        // if no extension then guess extension.
                        if (![".js", ".ts"].includes(file.slice(-3))) {
                            file = file + "." + ($.isTypescript() ? "ts" : "js");
                        }

                        // Resolve file path in case of smart paths.
                        file = $.path.resolve(file);

                        // if not exists then throw error.
                        if (!$.file.exists(file)) {
                            return error(`:param not found: ${file}`);
                        }

                        return true;
                    })
                }
            }
        );

        // Stop and return error if any.
        if (e) {
            $.logError(`Params Loader Config Error:`);
            return $.logErrorAndExit(e.message);
        }

        // Update config with validated config
        $.config.set("paramsLoader", validatedConfig);

        // Continue booting.
        return next();
    });
}
