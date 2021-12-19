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

    r.path("content", () => {
        r.post("@paste");
        r.get("clips/:folder?", "clips");
    })
        .middlewares(["Auth.validateToken"])
        .controller("Client/Content");

    r.useController("Client/Folder", () => {
        r.path("folders", () => {
            r.get("=all");
            r.post("=create");
        }).middlewares(["Auth.validateToken"]);

        r.path("folder/:folder", () => {
            r.post("@setPassword");
        }).middlewares(["Auth.validateToken", "params.folder"]);
    });
});
