import { getInstanceRouter } from "xpresser";
/**
 * See https://xpresserjs.com/router/
 */
const r = getInstanceRouter();

/**
 * Url: "/" points to AppController@index
 * The index method of the controller.
 */
r.path("/api/v1/", () => {
    r.get("ping", "Api@ping");

    r.path("auth", () => {
        r.post("@login");
        r.post("@signup");
        r.post("@apiKey");

        r.post("@checkUsername");
    }).controller("Auth");
});
