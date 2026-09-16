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

    // Ends every session of the account.
    r.path("auth", () => {
        r.post("@logout");
    })
        .controller("Auth")
        .middlewares(["Auth.validateToken"]);

    r.useController("Client/Content", () => {
        r.post("clips/find", "find");
        r.post("clips/paste/:pasteId", "publicPaste");

        r.path("clips", () => {
            r.post("@paste");

            r.post("@copy");
            r.post("@move");

            // Must be declared before ":folder?" so "search" is not treated as a folder.
            r.get("@search");

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
            // Alias, for clients that cannot send a body with a DELETE.
            r.post("@delete");

            r.post("@rename");
            r.post("@setPassword");
            r.post("@checkPassword");
            r.post("@enablePublicPaste");
            r.post("@disablePublicPaste");
        }).middlewares(["Auth.validateToken", "params.folder"]);
    });

    r.path("account/owns3", () => {
        r.get("=status");
        r.post("=connect");
        r.post("@useDefault");
        r.post("@disconnect");
    }).controller("Client/Owns3").middlewares(["Auth.validateToken"]);

    r.useController("Client/File", () => {
        r.path("files", () => {
            r.get("=all");
            r.post("@upload");
        }).middlewares(["Auth.validateToken"]);

        r.path("file/:file", () => {
            r.post("@confirm");
            r.get("@url");
            r.post("@delete");
        }).middlewares(["Auth.validateToken", "params.file"]);
    });

    r.useController("Client/Device", () => {
        r.path("devices", () => {
            r.get("=all");
            r.post("=create");
        }).middlewares(["Auth.validateToken"]);

        r.path("device/:device", () => {
            r.delete("=delete");

            r.post("@rename");
            r.post("folder", "setFolder");
            r.post("rotate-key", "rotateKey");
            r.post("@enable");
            r.post("@disable");
        }).middlewares(["Auth.validateToken", "params.device"]);
    });

    r.path("account", () => {
        r.post("@setPlan");
        r.post("@setEmail");
        r.post("@changePassword");

        r.post("subscribe", "Subscription@subscribe");
        r.get("subscription", "Subscription@status");
        r.post("subscription/cancel", "Subscription@cancel");
    }).controller("Client/Account").middlewares(["Auth.validateToken"]);
});

/**
 * Legacy api of the first OwnClipboard platform, kept so old apps keep working.
 * Same paths and same responses as the old "/api", so an app only changes host.
 * Authenticated with a device api key, never with the jwt.
 */
r.post("/api/validate", "LegacyApi@validate");

r.path("/api", () => {
    r.post("@connect");
    r.get("@all");
    r.post("@add");
    r.delete("@delete");

    // Unknown legacy route.
    r.any("*", "notFound");
})
    .controller("LegacyApi")
    .middlewares(["LegacyApi"]);

/**
 * Payment provider webhooks.
 * Not under /client/v1 and not auth protected; each handler verifies its own signature.
 */
r.path("/webhooks", () => {
    r.post("nowpayments/ipn", "NowPayments@ipn");
});


// 404 Route.
r.routesAfterPlugins = () => {
    r.any("*", "Api@notFound");
};
