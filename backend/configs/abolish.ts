/**
 * -------------------
 * Config Generated by command:
 * xjs import abolish configs
 * -------------------
 */
import { Abolish } from "abolish";
import { Http } from "xpresser/types/http";
import type AbolishError from "abolish/src/AbolishError";

Abolish.useJoi();

export = () => ({
    /**
     * Validation Rules
     * If `validationRules.enabled` is true
     * Your ValidationRule file will be loaded
     */
    validationRules: {
        enabled: true,
        // Validation File Path
        file: "backend://abolish/Rules",
        // On Validation Error
        onError(http: Http, err: AbolishError) {
            return http.status(400).json({ error: err.message });
        }
    },

    /**
     * Abolish Instance Extender.
     */
    extendAbolish() {
        // Extend Abolish here.
        Abolish.addGlobalValidators(require("abolish/validators/string"));
        Abolish.addGlobalValidators(require("abolish/validators/array"));

        // Include Custom Validators
        require("../abolish/validators");

        return Abolish;
    }
});
