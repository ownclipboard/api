import { getInstanceRouter } from "xpresser";

/**
 * See https://xpresserjs.com/router/
 */
const r = getInstanceRouter();

/**
 * Url: "/" points to AppController@index
 * The index method of the controller.
 */
r.path("/client/v1/", () => {
    r.get("ping", "Client@ping");

    r.path("auth", () => {
        r.post("@login");
        r.post("@signup");

        r.post("@checkUsername");
    }).controller("Auth");

    r.useController("Client/Content", () => {
        r.path("clips", () => {
            r.post("@paste");
            r.get(":folder?", "clips");
        }).middlewares(["Auth.validateToken"]);

        r.path("clip/:clip", () => {
            r.post("@delete");
            r.post("@update");
        }).middlewares(["Auth.validateToken", "params.clip"]);
    });

    r.useController("Client/Folder", () => {
        r.path("folders", () => {
            r.get("=all");
            r.post("=create");
        }).middlewares(["Auth.validateToken"]);

        r.path("folder/:folder", () => {
            r.post("@setPassword");
            r.post("@checkPassword");
        }).middlewares(["Auth.validateToken", "params.folder"]);
    });
});
