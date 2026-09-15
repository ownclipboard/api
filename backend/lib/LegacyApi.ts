import type { Http } from "xpresser/types/http";
import type Device from "../models/Device";
import type Content from "../models/Content";
import type { ContentDataType } from "../models/Content";
import type User from "../models/User";
import { htmlEntities, nl2br } from "../functions";

/**
 * Helpers of the legacy api served at `/api/*`.
 *
 * Everything here exists to reproduce the responses of the first OwnClipboard
 * platform byte for byte, so apps written against `yourdomain.com/api/*` keep
 * working when pointed at `/api/*`. Do not "improve" these shapes.
 */

/** Errors of the old api, with the exact type and message strings it used. */
export const LegacyApiErrors = {
    apiKeyNotFound: { type: "api_key_not_found", message: `ApiKey not found in request.` },
    apiKeyNotValid: { type: "api_key_not_valid", message: `ApiKey found but not valid.` },
    apiKeyNotConnected: {
        type: "api_key_not_connected",
        message: `ApiKey not connected, use /api/connect for first api key connection.`
    },
    clipNotValid: { type: "clip_not_valid", message: `Clip not valid, maybe already deleted.` },
    clipNotFound: { type: "clip_not_found", message: `Clip not found in request.` },
    emptyContent: { type: "empty_content", message: `Content is empty.` },
    routeNotFound: { type: "404", message: `Route not found!` }
};

export type LegacyApiError = { type: string; message: string };

/** Success envelope: `{status, data}`. */
export function legacyApiData(http: Http, data: Record<string, any>, status: number = 200) {
    return http.status(status).json({ status, data });
}

/** Error envelope: `{status, error}`. */
export function legacyApiError(http: Http, error: LegacyApiError, status: number = 200) {
    return http.status(status).json({ status, error });
}

/** What the legacy middleware resolved for the current request. */
export interface LegacyApiState {
    apiKey: string;
    device: Device;
    user: User;
    clip?: Content;
}

export function setLegacyApiState(http: Http, state: LegacyApiState) {
    http.state.set("legacyApi", state);
}

export function legacyApiState(http: Http): LegacyApiState {
    return http.state.get<LegacyApiState>("legacyApi")!;
}

/** Date in the format the old sqlite/mysql rows were serialised with. */
export function legacyDate(date?: Date | null): string | null {
    if (!date) return null;
    return date.toISOString().replace("T", " ").slice(0, 19);
}

/**
 * A clip as the old api returned it: the fields of `Content.jsPick`.
 * `code` is the clip's publicId and `content` its text.
 */
export function legacyClip(clip: ContentDataType) {
    const { publicId, type, context, locked, favorite, createdAt } = clip;

    return {
        code: publicId,
        // The old platform only knew these two types.
        type: type === "url" ? "url" : "text",
        content: context,
        locked: locked ? 1 : 0,
        favorite: favorite ? 1 : 0,
        created_at: legacyDate(createdAt),
        html_formatted: nl2br(htmlEntities(context))
    };
}
