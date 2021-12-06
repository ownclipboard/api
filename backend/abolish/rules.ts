/**
 * This file holds all request body validation rules..
 *
 * Rules declared here is used by the abolish middleware to validate request body.
 */
import AbolishRoutes from "@xpresser/abolish/dist/AbolishRoutes";
import { isPasswordRequired, isUsername } from "./reusables";

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

// Export Rules.
export = validate;
