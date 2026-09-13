/**
 * This file holds all request body validation rules.
 *
 * Rules declared here is used by to abolish middleware to validate request body.
 */

import Content from "../models/Content";
import RoutesGuard from "@xpresser/abolish/RoutesGuard";
import { skipIfUndefined } from "abolish/src/helpers";
import { $joi } from "abolish/others/joi";
import { isString, isStringRequired } from "./reusables";


const validate = new RoutesGuard();


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
// Validate rename folder route (uniqueness is checked in the action, since the folder may keep its slug)
validate.post("Client/Folder@rename", {
    name: [isStringRequired, "maxLength:100"]
});

validate.post("Client/Folder@setPassword", {
    password: [isStringRequired, "md5"]
});

// Validate setup folder password
validate.post("Client/Folder@checkPassword", {
    password: [isStringRequired, "md5"]
});

// Validate update clip route
// Only title and content can be updated. `encrypted` is intentionally not accepted here.
validate.post("Client/Content@update", {
    title: skipIfUndefined(isStringRequired),
    content: skipIfUndefined(isStringRequired)
});

// Validate delete clip route
validate.post("Client/Content@delete", (http) => {
    const clip = http.loadedParam<Content>("clip");
    return {
        password: [{ $skip: !clip.data.encrypted }, isStringRequired, "md5"]
    };
});

// Validate copy/move clips routes
const transferClipsRules = (http: any) => ({
    ids: $joi((joi) =>
        joi.array().required().min(1).max(100).items(joi.string().label("ids.*")).label("ids")
    ),
    folder: [isStringRequired, { setAuthId: http.authUserId() }, "FolderExists"]
});

validate.post("Client/Content@copy", transferClipsRules);
validate.post("Client/Content@move", transferClipsRules);

// Validate owns3 connect
validate.post("Client/Owns3@connect", {
    endpoint: [isStringRequired, "maxLength:500"],
    apiKey: [isStringRequired, "maxLength:500"]
});

// Validate file upload slot request
validate.post("Client/File@upload", (http) => ({
    name: [isStringRequired, "maxLength:255"],
    title: skipIfUndefined([isStringRequired, "maxLength:255"]),
    contentType: skipIfUndefined([isString, "maxLength:255"]),
    size: skipIfUndefined("number|min:0"),
    folder: ["default:clipboard", isStringRequired, { setAuthId: http.authUserId() }, "FolderExists"]
}));

// Validate device routes
const deviceName = [isStringRequired, "minLength:2|maxLength:50"];

validate.post("Client/Device@create", (http) => ({
    name: deviceName,
    folder: [
        "default:clipboard",
        isStringRequired,
        { setAuthId: http.authUserId() },
        "FolderExists"
    ]
}));

validate.post("Client/Device@rename", { name: deviceName });

validate.post("Client/Device@setFolder", (http) => ({
    folder: [isStringRequired, { setAuthId: http.authUserId() }, "FolderExists"]
}));

validate.post("Client/Content@find", {
    ids: $joi((joi) => joi.array().required().items(joi.string().label("ids.*")).label("ids"))
});

// Export Rules.
export = validate;
