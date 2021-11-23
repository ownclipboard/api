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
    r.path("auth", () => {
        r.post("@login");
        r.post("@signup");
        r.post("@apiKey");
    }).controller("Auth");
});
