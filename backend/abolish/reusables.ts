/**
 * All reusable abolish rules are declared here.
 * Reducing redundancy when declaring rules.
 */
import { Rule } from "abolish/src/Functions";
import { ParseRules } from "abolish";

export const isString = Rule([
    "typeof:string|string:trim",
    { $errors: { typeof: ":param expects a string!" } }
]);

export const isStringRequired = Rule([
    "required|typeof:string|string:trim",
    { $errors: { typeof: ":param expects a string!" } }
]);

export const isUsername = Rule([isStringRequired, "min:3|maxLength:250", "alphaNumeric"]);

export const isEmailRequired = Rule([
    isStringRequired,
    "maxLength:250|string:trim,toLowerCase|email"
]);

export const isPasswordRequired = Rule([isStringRequired, "minLength:6|maxLength:500"]);

export type PaginationRules = { page: number; perPage: number };

export const PaginationRules = ParseRules<PaginationRules>({
    page: "default:1|number|min:1",
    perPage: "default:30|number|max:1000"
});

export const isExactLength = (length: number) => ({ minLength: length, maxLength: length });
