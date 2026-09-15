import type { Controller, Http } from "xpresser/types/http";
import Content, { ContentDataType } from "../models/Content";
import { escapeRegexp } from "xpress-mongo/fn/helpers";
import { oc_stringSize } from "../functions";
import { LegacyApiErrors, legacyApiData, legacyApiError, legacyApiState, legacyClip } from "../lib/LegacyApi";

/**
 * LegacyApiController
 *
 * The api of the first OwnClipboard platform, served at `/api/*` so apps
 * built against the old `/api/*` endpoints keep working. Request and response
 * shapes are reproduced exactly, including the `{status, data}` envelope, the
 * `{status, error}` errors and the snake_case clip fields.
 *
 * A device is bound to one folder: it only ever reads, writes and deletes clips there.
 */
export = <Controller.Object>{
    // Controller Name
    name: "LegacyApiController",

    // Controller Default Error Handler.
    e: (http: Http, error: string) =>
        http.status(500).json({ status: 500, error: { type: "server_error", message: error } }),

    /**
     * @openapi
     * /api/validate:
     *   post:
     *     tags: [Legacy]
     *     summary: Validate that this host is an OwnClipboard server
     *     description: |
     *       Legacy api. Needs no api key: apps call it to confirm an endpoint belongs to
     *       OwnClipboard before asking the user for a key.
     *     responses:
     *       200:
     *         description: This is an OwnClipboard server.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 status: { type: integer, example: 200 }
     *                 data:
     *                   type: object
     *                   properties:
     *                     allowPublicValidation: { type: boolean, example: true }
     */
    validate(http) {
        return legacyApiData(http, { allowPublicValidation: true });
    },

    /**
     * @openapi
     * /api/connect:
     *   post:
     *     tags: [Legacy]
     *     summary: Connect an api key (one time)
     *     description: |
     *       Legacy api. A key has to be connected once before any other endpoint accepts it.
     *       The app may send a `device_id` to tie the key to itself. The key is echoed back.
     *       Send the key as the `oc-key` header, an `api_key` query param or an `api_key` body field.
     *     requestBody:
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               api_key: { type: string, minLength: 100, maxLength: 100 }
     *               device_id: { type: string, description: Identifier of the app or machine. }
     *     responses:
     *       200:
     *         description: Connected.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 status: { type: integer, example: 200 }
     *                 data:
     *                   type: object
     *                   properties:
     *                     name: { type: string }
     *                     api_key: { type: string }
     *                     hits: { type: integer }
     *                     used_by: { type: [string, "null"] }
     *       401:
     *         description: "`api_key_not_found` or `api_key_not_valid`."
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
     */
    async connect(http) {
        const { device, apiKey } = legacyApiState(http);

        if (!device.isConnected()) {
            const deviceId = http.body("device_id", undefined) as unknown;

            device.data.connectedAt = new Date();

            if (typeof deviceId === "string" && deviceId.trim().length) {
                device.data.usedBy = deviceId.trim().slice(0, 255);
            }

            await device.save();
        }

        return legacyApiData(http, {
            name: device.data.name,
            api_key: apiKey,
            hits: device.data.hits,
            used_by: device.data.usedBy ?? null
        });
    },

    /**
     * @openapi
     * /api/all:
     *   get:
     *     tags: [Legacy]
     *     summary: Get or search clips
     *     description: |
     *       Legacy api. Returns the clips of the device's folder, newest first, 20 per page.
     *       `search` matches the clip text and is ignored when shorter than 2 characters.
     *       File clips are never returned.
     *     parameters:
     *       - { in: query, name: api_key, schema: { type: string } }
     *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
     *       - { in: query, name: search, schema: { type: string } }
     *     responses:
     *       200:
     *         description: A page of clips.
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/LegacyClipsResponse" }
     *       401:
     *         description: "`api_key_not_found`, `api_key_not_valid` or `api_key_not_connected`."
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
     */
    async all(http) {
        const { device, user } = legacyApiState(http);

        let page = Number(http.query("page", 1));
        if (!page || page < 1) page = 1;

        const search = http.query("search", undefined) as unknown as string | undefined;

        const query: Record<string, any> = {
            userId: user.id(),
            folder: device.data.folder,
            encrypted: { $ne: true },
            fileId: { $exists: false }
        };

        // The old api only searched the clip text, and only from 2 characters.
        if (typeof search === "string" && search.length > 1) {
            query.context = new RegExp(escapeRegexp(search), "i");
        }

        const clips = await Content.paginate<ContentDataType>(page, 20, query, {
            sort: { createdAt: -1 }
        });

        return legacyApiData(http, {
            search,
            clips: { ...clips, data: clips.data.map(legacyClip) }
        });
    },

    /**
     * @openapi
     * /api/add:
     *   post:
     *     tags: [Legacy]
     *     summary: Add a clip
     *     description: |
     *       Legacy api. Adds a clip to the device's folder. Identical text already in that folder
     *       is not duplicated: the existing clip is returned with `exists: true`.
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [content]
     *             properties:
     *               api_key: { type: string }
     *               content: { type: string }
     *     responses:
     *       200:
     *         description: The created or existing clip.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 status: { type: integer, example: 200 }
     *                 data:
     *                   type: object
     *                   properties:
     *                     content: { $ref: "#/components/schemas/LegacyClip" }
     *                     exists: { type: boolean }
     *       422:
     *         description: "`empty_content`."
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
     */
    async add(http) {
        const { device, user } = legacyApiState(http);

        const text = http.body("content", undefined) as unknown;

        if (typeof text !== "string" || !text.trim().length) {
            return legacyApiError(http, LegacyApiErrors.emptyContent, 422);
        }

        const context = text.trim();
        const userId = user.id();
        const folder = device.data.folder;

        // Same text in the same folder is never stored twice.
        let clip = await Content.findOne({
            userId,
            folder,
            context,
            fileId: { $exists: false }
        });

        const exists = !!clip;

        if (!clip) {
            clip = Content.make(<ContentDataType>{ userId, context, folder });
            clip.setContextType();
            clip.data.size = oc_stringSize(context);

            await clip.save();
        }

        return legacyApiData(http, { content: legacyClip(clip.data), exists });
    },

    /**
     * @openapi
     * /api/delete:
     *   delete:
     *     tags: [Legacy]
     *     summary: Delete a clip
     *     description: |
     *       Legacy api. `clip` is the `code` of the clip, sent as a query param or a body field.
     *       Only clips in the device's folder can be deleted.
     *     parameters:
     *       - { in: query, name: api_key, schema: { type: string } }
     *       - { in: query, name: clip, schema: { type: string }, description: Clip code. }
     *     responses:
     *       200:
     *         description: Deleted.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 status: { type: integer, example: 200 }
     *                 data:
     *                   type: object
     *                   properties:
     *                     deleted: { type: boolean, example: true }
     *                     code: { type: string }
     *       404:
     *         description: "`clip_not_valid`."
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
     *       422:
     *         description: "`clip_not_found`, no clip in the request."
     *         content:
     *           application/json:
     *             schema: { $ref: "#/components/schemas/LegacyErrorResponse" }
     */
    async delete(http) {
        const { clip } = legacyApiState(http);

        // The middleware refuses the request when no clip is given.
        const code = clip!.data.publicId;
        await clip!.delete();

        return legacyApiData(http, { deleted: true, code });
    },

    /**
     * Anything else under /api.
     */
    notFound(http) {
        return legacyApiError(http, LegacyApiErrors.routeNotFound, 404);
    }
};
