import type { Controller, Http } from "xpresser/types/http";
import User, { Owns3Config } from "../../models/User";
import File from "../../models/File";
import Owns3, { normalizeOwns3Endpoint, Owns3Error, OWNS3_REQUIRED_PERMISSIONS } from "../../lib/Owns3";
import { encryptSecret } from "../../lib/Crypto";

/** Public view of a user's owns3 connection. Never includes the api key. */
function toStatus(config?: Owns3Config) {
    if (!config) return { connected: false as const };

    return {
        connected: true as const,
        endpoint: config.endpoint,
        app: config.app,
        permissions: config.permissions,
        connectedAt: config.connectedAt
    };
}

/**
 * Owns3Controller
 * Lets a user connect their own owns3 server, where their files are stored.
 */
export = <Controller.Object>{
    name: "Client/Owns3Controller",

    e: (http: Http, error: string) => http.status(401).json({ error }),

    middlewares: {
        Abolish: ["connect"]
    },

    /**
     * @openapi
     * /client/v1/account/owns3:
     *   get:
     *     tags: [Files]
     *     summary: owns3 connection status
     *     description: Whether the user has connected their own owns3 server (https://github.com/ownclipboard/owns3), where their files are stored. Never returns the api key.
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
        const user = await User.findById(http.authUserId(), { projection: { owns3: 1 } });
        return toStatus(user?.data.owns3);
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

        const client = new Owns3(endpoint, apiKey);

        let me;
        try {
            me = await client.me();
        } catch (e: any) {
            const status = e instanceof Owns3Error ? e.status : 502;
            return http.error(`Could not connect to owns3: ${e.message}`, status);
        }

        const permissions = me.key?.permissions ?? [];
        const missing = OWNS3_REQUIRED_PERMISSIONS.filter((p) => !permissions.includes(p));

        if (missing.length) {
            return http.badRequestError(
                `The owns3 api key is missing the [${missing.join(", ")}] permission(s). Create a key with read, write and delete.`
            );
        }

        const config: Owns3Config = {
            endpoint,
            apiKey: encryptSecret(apiKey),
            app: me.app,
            permissions,
            connectedAt: new Date()
        };

        await User.native().updateOne({ _id: http.authUserId() }, { $set: { owns3: config } });

        return { ...toStatus(config), bucket: me.bucket, message: "owns3 server connected." };
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
