import { customAlphabet, nanoid } from "nanoid";
import { randomInt } from "crypto";
import slugify from "slugify";

// custom nanoid with only alphanumeric characters
const nanoidAlphaNumeric = customAlphabet(
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
);

/**
 * Custom Nanoid Function
 * @param min
 * @param max
 */
export function oc_nanoid(min: number, max?: number) {
    return nanoid(max === undefined ? min : randomInt(min, max));
}

/**
 * Stripped nanoid
 * Strips off "-", "_"
 * @param min
 * @param max
 */
export function oc_nanoidStripped(min: number, max?: number) {
    return nanoidAlphaNumeric(max === undefined ? min : randomInt(min, max));
}

/**
 * Custom Slugify
 * @param str
 * @param replacement
 */
export function oc_slug(str: string, replacement: string = "-") {
    return slugify(str, { strict: true, trim: true, replacement, lower: true });
}

export function oc_uniqueStringArray(str: string[]) {
    const newArray: string[] = [];
    for (const s of str) {
        if (!newArray.includes(s)) newArray.push(s);
    }

    return newArray;
}
