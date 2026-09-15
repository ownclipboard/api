import type { Controller, Http } from "xpresser/types/http";
import User, { Owns3Config } from "../../models/User";
import File from "../../models/File";
import Owns3, {
    defaultOwns3,
    normalizeOwns3Endpoint,
    Owns3Error,
    Owns3Me,
    Owns3Permission,
    owns3Status as toStatus,
    OWNS3_REQUIRED_PERMISSIONS
} from "../../lib/Owns3";
import { encryptSecret } from "../../lib/Crypto";

/** Validate a client against owns3 `/me` and check the required permissions. Returns an error message or the `/me` payload. */
type Verified = { error: string; status: number } | { me: Owns3Me; permissions: Owns3Permission[] };

async function verifyClient(client: Owns3): Promise<Verified> {
    let me: Owns3Me;
    try {
        me = await client.me();
    } catch (e: any) {
        const status = e instanceof Owns3Error ? e.status : 502;
        return { error: `Could not connect to owns3: ${e.message}`, status };
    }

    const permissions = me.key?.permissions ?? [];
    const missing = OWNS3_REQUIRED_PERMISSIONS.filter((p) => !permissions.includes(p));

    if (missing.length) {
        return {
            error: `The owns3 api key is missing the [${missing.join(", ")}] permission(s). Create a key with read, write and delete.`,
            status: 400
        };
    }

    return { me, permissions };
}

/**
 * Owns3Controller
 * Lets a user connect their own owns3 server, where their files are stored.
 */
export = <Controller.Object>{
    name: "Client/Owns3Controller",

    e: (http: Http, error: string) => http.status(401).json({ error }),

    middlewares: {
        Abolish: ["connect"],
        // The default storage is a Pro perk.
        IsProUser: ["useDefault"]
    },

    /**
     * @openapi
     * /client/v1/account/owns3:
     *   get:
     *     tags: [Files]
     *     summary: owns3 connection status
     *     description: |
     *       Whether the user has a storage connected: their own owns3 server (https://github.com/ownclipboard/owns3)
     *       or the app's default one (`default: true`). `defaultAvailable` says whether the default option is offered.
     *       Never returns an api key.
     *     security: [{ ocToken: [] }]
     *     responses:
     *       200:
     *         description: Connection status.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/Owns3Status" }
     *       401:
     *         description: Missing or invalid `oc_token`.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *   post:
     *     tags: [Files]
     *     summary: Connect an owns3 server
     *     description: |
     *       Validates the endpoint and api key against owns3 `/api/v1/me`. The key must carry the
     *       `read`, `write` and `delete` permissions. Replaces any previous connection.
     *       The key is stored encrypted.
     *     security: [{ ocToken: [] }]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema: { $ref: "#/components/schemas/Owns3ConnectBody" }
     *           example: { endpoint: 'https://owns3.example.com', apiKey: owns3_xxx }
     *     responses:
     *       200:
     *         description: Connected.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/Owns3ConnectResponse" }
     *       400:
     *         description: Invalid endpoint or the key lacks a required permission.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       401:
     *         description: owns3 rejected the api key.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       502:
     *         description: The owns3 endpoint could not be reached.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Connection status.
     */
    async status(http) {
        const user = await User.findById(http.authUserId(), { projection: { owns3: 1, plan: 1 } });
        return toStatus(user?.data.owns3, user?.data.plan);
    },

    /**
     * Connect (or replace) the user's owns3 server.
     * Validates the endpoint and key against owns3 `/me` and requires read, write and delete.
     */
    async connect(http) {
        const { endpoint: rawEndpoint, apiKey } = http.validatedBody<{ endpoint: string; apiKey: string }>();

        let endpoint: string;
        try {
            endpoint = normalizeOwns3Endpoint(rawEndpoint);
        } catch (e: any) {
            return http.badRequestError(e.message);
        }

        const verified = await verifyClient(new Owns3(endpoint, apiKey));
        if ("error" in verified) return http.error(verified.error, verified.status);

        const config: Owns3Config = {
            endpoint,
            apiKey: encryptSecret(apiKey),
            app: verified.me.app,
            permissions: verified.permissions,
            connectedAt: new Date()
        };

        await User.native().updateOne({ _id: http.authUserId() }, { $set: { owns3: config } });

        return { ...toStatus(config), bucket: verified.me.bucket, message: "owns3 server connected." };
    },

    /**
     * @openapi
     * /client/v1/account/owns3/use-default:
     *   post:
     *     tags: [Files]
     *     summary: Use the app's default storage
     *     description: |
     *       Pro only. Connects the user to the owns3 storage operated by OwnClipboard, so they can
     *       upload files without running their own server. Files are stored under the user's own
     *       prefix. Replaces any previously connected server. Only available when the status reports
     *       `defaultAvailable`. If the Pro subscription later expires, the status reports
     *       `proRequired` and uploads are refused until it is renewed or an own server is connected.
     *     security: [{ ocToken: [] }]
     *     responses:
     *       403:
     *         description: Not a Pro user.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     *       200:
     *         description: Connected to the default storage.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/Owns3ConnectResponse" }
     *       503:
     *         description: The default storage is not configured or not reachable.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Connect the user to the app's default owns3 storage (from env).
     * Only a marker is stored; endpoint and key are resolved from env on every request.
     */
    async useDefault(http) {
        const client = defaultOwns3();
        if (!client) return http.error("Default storage is not available on this server.", 503);

        const verified = await verifyClient(client);
        if ("error" in verified) return http.error(verified.error, 503);

        const config: Owns3Config = {
            isDefault: true,
            endpoint: client.endpoint,
            app: verified.me.app,
            permissions: verified.permissions,
            connectedAt: new Date()
        };

        await User.native().updateOne({ _id: http.authUserId() }, { $set: { owns3: config } });

        return { ...toStatus(config, "pro"), bucket: verified.me.bucket, message: "Connected to the default storage." };
    },

    /**
     * @openapi
     * /client/v1/account/owns3/disconnect:
     *   post:
     *     tags: [Files]
     *     summary: Disconnect the owns3 server
     *     description: Removes the stored endpoint and key. Uploaded files stay on the server but cannot be downloaded or deleted until a server is connected again.
     *     security: [{ ocToken: [] }]
     *     responses:
     *       200:
     *         description: Disconnected.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/Owns3DisconnectResponse" }
     *       400:
     *         description: No server connected.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/ErrorResponse" }
     */
    /**
     * Disconnect the owns3 server. Files already uploaded stay recorded but
     * cannot be downloaded or deleted until a server is connected again.
     */
    async disconnect(http) {
        const userId = http.authUserId();

        const result = await User.native().updateOne({ _id: userId, owns3: { $exists: true } }, { $unset: { owns3: "" } });
        if (!result.modifiedCount) return http.badRequestError("No owns3 server is connected.");

        const files = await File.count({ userId, status: "uploaded" });

        return {
            connected: false,
            files,
            message: files
                ? `owns3 server disconnected. ${files} file(s) remain on it and will be unavailable until you reconnect.`
                : "owns3 server disconnected."
        };
    }
};
