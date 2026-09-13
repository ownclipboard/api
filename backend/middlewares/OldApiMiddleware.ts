import type { Http } from "xpresser/types/http";
import Device from "../models/Device";
import User from "../models/User";
import Content from "../models/Content";
import { OldApiErrors, oldApiError, setOldApiState } from "../lib/OldApi";

/**
 * OldApiMiddleware
 * Authenticates a legacy api request with a device api key, exactly like the
 * first OwnClipboard platform did: key from the `oc-key` header, the `api_key`
 * query or the `api_key` body field, and the same error shapes and statuses.
 */
export = {
    // Default middleware action
    async allow(http: Http) {
        const apiKey =
            http.req.headers["oc-key"] || http.req.query["api_key"] || http.req.body?.["api_key"];

        // No key at all.
        if (!apiKey) return oldApiError(http, OldApiErrors.apiKeyNotFound, 401);

        // Keys are always exactly 100 characters.
        if (typeof apiKey !== "string" || apiKey.length !== Device.keyLength) {
            return oldApiError(http, OldApiErrors.apiKeyNotValid, 401);
        }

        const device = await Device.findByApiKey(apiKey);

        // Unknown or disabled keys are both "not valid".
        if (!device || !device.data.enabled) {
            return oldApiError(http, OldApiErrors.apiKeyNotValid, 401);
        }

        // A key must be connected once before it can be used elsewhere.
        const isConnect = http.req.path.endsWith("/connect");
        if (!device.isConnected() && !isConnect) {
            return oldApiError(http, OldApiErrors.apiKeyNotConnected, 401);
        }

        const user = await User.findById(device.data.userId);
        if (!user) return oldApiError(http, OldApiErrors.apiKeyNotValid, 401);

        // Resolve `clip` when the request carries one. Deletes require it.
        let clip: Content | undefined;
        const clipCode = (http.query("clip", undefined) ?? http.body("clip", undefined)) as
            | string
            | undefined;

        if (clipCode) {
            const found = await Content.findOne({
                publicId: clipCode,
                userId: user.id(),
                // A device only sees its own folder, and never file clips.
                folder: device.data.folder,
                fileId: { $exists: false }
            });

            if (!found) return oldApiError(http, OldApiErrors.clipNotValid, 404);

            clip = found;
        } else if (http.req.url.includes("delete")) {
            return oldApiError(http, OldApiErrors.clipNotFound, 422);
        }

        setOldApiState(http, { apiKey, device, user, clip });

        // Count the call, in the background.
        Device.native()
            .updateOne(
                { _id: device.id() },
                { $inc: { hits: 1 }, $set: { lastUsedAt: new Date() } }
            )
            .catch((e) => console.error("[old-api] hits:", e.message));

        return http.next();
    }
};
