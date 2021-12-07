/**
 * This file holds all request body validation rules..
 *
 * Rules declared here is used by the abolish middleware to validate request body.
 */
import AbolishRoutes from "@xpresser/abolish/dist/AbolishRoutes";
import { skipIfUndefined } from "abolish/src/Functions";
import { isPasswordRequired, isString, isUsername } from "./reusables";

const validate = new AbolishRoutes();

// Validate Login Route
validate.post("Auth@login", {
    username: [isUsername, "UsernameExists"],
    password: isPasswordRequired
});

// Validate Signup Route
validate.post("Auth@signup", {
    username: [isUsername, "!UsernameExists"],
    password: isPasswordRequired
});

// Validate check username route
validate.post("Auth@checkUsername", {
    username: isUsername
});

// Validate paste route
validate.post("Client/Content@paste", {
    title: skipIfUndefined(isString),
    content: isPasswordRequired
});

// Export Rules.
export = validate;
