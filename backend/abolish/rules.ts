/**
 * This file holds all request body validation rules..
 *
 * Rules declared here is used by the abolish middleware to validate request body.
 */
import AbolishRoutes from "@xpresser/abolish/dist/AbolishRoutes";
import { skipIfUndefined } from "abolish/src/Functions";
import { isPasswordRequired, isString, isStringRequired, isUsername } from "./reusables";

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
    content: isStringRequired,
    folder: ["default:clipboard", isStringRequired]
});

// Validate create folder route
validate.post("Client/Folder@create", (http) => ({
    name: [isStringRequired, { setAuthId: http.authUserId() }, "!FolderExists"]
}));

// Validate setup folder password
validate.post("Client/Folder@setPassword", {
    password: [isStringRequired, "md5"]
});

// Export Rules.
export = validate;
