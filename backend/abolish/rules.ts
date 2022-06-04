/**
 * This file holds all request body validation rules.
 *
 * Rules declared here is used by to abolish middleware to validate request body.
 */
import AbolishRoutes from "@xpresser/abolish/dist/AbolishRoutes";
import { isPasswordRequired, isString, isStringRequired, isUsername } from "./reusables";
import Content from "../models/Content";
import { skipIfUndefined } from "abolish/src/helpers";
import { $joi } from "abolish/others/joi";

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
validate.post("Client/Content@paste", (http) => ({
    title: skipIfUndefined(isString),
    content: isStringRequired,
    folder: [
        "default:clipboard",
        isStringRequired,
        { setAuthId: http.authUserId() },
        "FolderExists"
    ]
}));

// Validate paste route
// validate.post("Client/Content@upload", (http) => ({
//     title: skipIfUndefined(isString),
//     folder: [
//         "default:clipboard",
//         isStringRequired,
//         { setAuthId: http.authUserId() },
//         "FolderExists"
//     ]
// }));

// Validate public paste route
validate.post("Client/Content@publicPaste", {
    title: skipIfUndefined(isString),
    content: isStringRequired
});

// Validate create folder route
validate.post("Client/Folder@create", (http) => ({
    name: [isStringRequired, { setAuthId: http.authUserId() }, "!FolderExists"]
}));

// Validate setup folder password
validate.post("Client/Folder@setPassword", {
    password: [isStringRequired, "md5"]
});

// Validate setup folder password
validate.post("Client/Folder@checkPassword", {
    password: [isStringRequired, "md5"]
});

// Validate update clip route
validate.post("Client/Content@update", {
    title: skipIfUndefined(isStringRequired),
    content: skipIfUndefined(isStringRequired),
    encrypted: "!default|boolean"
});

// Validate delete clip route
validate.post("Client/Content@delete", (http) => {
    const clip = http.loadedParam<Content>("clip");
    return {
        password: [{ $skip: !clip.data.encrypted }, isStringRequired, "md5"]
    };
});

validate.post("Client/Content@find", {
    ids: $joi((joi) => joi.array().required().items(joi.string().label("ids.*")).label("ids"))
});

// Export Rules.
export = validate;
