import { oc_nanoidStripped } from "../../functions/string.fn";
import { is } from "xpress-mongo";

export function RandomLengthStringSchema(min: number = 10, max: number = 21) {
    return is.String(() => oc_nanoidStripped(min, max));
}

export function PublicIdSchema(prefix = "", length = 21) {
    return is.String(() => prefix + oc_nanoidStripped(length));
}
