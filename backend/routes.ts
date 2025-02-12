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
        r.post("clips/find", "find");
        r.post("clips/paste/:pasteId", "publicPaste");

        r.path("clips", () => {
            r.post("@paste");
            r.post("@upload");

            r.get(":folder?", "clips");
        }).middlewares(["Auth.validateToken"]);

        r.path("clip/:clip", () => {
            r.post("@delete");
            r.post("@update");
        }).middlewares(["Auth.validateToken", "params.clip"]);
    });

    r.useController("Client/Folder", () => {
        r.get("folders/public/:pasteId", "pasteId");

        r.path("folders", () => {
            r.get("=all");
            r.post("=create");
        }).middlewares(["Auth.validateToken"]);

        r.path("folder/:folder", () => {
            r.delete("=delete");

            r.post("@setPassword");
            r.post("@checkPassword");
            r.post("@enablePublicPaste");
            r.post("@disablePublicPaste");
        }).middlewares(["Auth.validateToken", "params.folder"]);
    });

    r.path("account", () => {
        r.post("@setPlan")
        r.post("subscribe", "Subscription@subscribe");
    }).controller("Client/Account").middlewares(["Auth.validateToken"]);
});
