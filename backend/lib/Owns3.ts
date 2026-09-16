import axios, { AxiosInstance } from "axios";

/**
 * Minimal client for an owns3 server (https://github.com/ownclipboard/owns3).
 * Every path is relative to the app folder the api key is confined to.
 */

export type Owns3Permission = "read" | "write" | "delete";

export type Owns3Me = {
    app: { id: string; name: string; slug: string; folder: string };
    key: { id: string; name: string; permissions: Owns3Permission[] };
    bucket: string;
};

export type Owns3Stat = {
    path: string;
    size: number;
    contentType: string;
    etag?: string;
    lastModified?: string;
};

export type Owns3ListedObject = {
    path: string;
    size: number;
    etag?: string;
    lastModified?: string;
};

export type Owns3Listing = {
    objects: Owns3ListedObject[];
    prefixes: string[];
    cursor: string | null;
    truncated: boolean;
};

/**
 * Rotating key that makes an app's files publicly readable at `{baseUrl}{path}`,
 * with no api key, so the urls work in `<img>` and `<video>`.
 * Requires preview links to be enabled for the app in owns3.
 */
export type Owns3PreviewKey = {
    key: string;
    expiresAt: string;
    ttlMinutes: number;
    baseUrl: string;
};

export type Owns3Presigned = {
    method: "PUT" | "GET";
    url: string;
    path: string;
    expiresIn: number;
};

export class Owns3Error extends Error {
    constructor(
        message: string,
        public status: number,
        public code: "unreachable" | "unauthorized" | "forbidden" | "not_found" | "invalid" | "error"
    ) {
        super(message);
    }
}

/**
 * Normalise a user supplied endpoint to a bare origin (+ optional base path),
 * without a trailing slash or `/api/v1` suffix.
 */
export function normalizeOwns3Endpoint(endpoint: string): string {
    let url: URL;
    try {
        url = new URL(endpoint.trim());
    } catch {
        throw new Owns3Error("Endpoint must be a valid http(s) url.", 400, "invalid");
    }

    if (!["http:", "https:"].includes(url.protocol)) {
        throw new Owns3Error("Endpoint must use http or https.", 400, "invalid");
    }

    let pathname = url.pathname.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
    return `${url.origin}${pathname}`;
}

class Owns3 {
    private readonly $api: AxiosInstance;

    constructor(
        public readonly endpoint: string,
        apiKey: string
    ) {
        this.$api = axios.create({
            baseURL: `${endpoint}/api/v1`,
            headers: { "x-api-key": apiKey },
            timeout: 15_000
        });
    }

    private async request<T>(fn: () => Promise<{ data: T }>): Promise<T> {
        try {
            return (await fn()).data;
        } catch (e: any) {
            const status: number | undefined = e?.response?.status;
            const data = e?.response?.data;
            // owns3 answers errors as { error: "..." } or { error: true, message: "..." }
            const detail: string | undefined =
                typeof data?.error === "string" ? data.error : typeof data?.message === "string" ? data.message : undefined;

            if (!status) throw new Owns3Error("Could not reach the owns3 endpoint.", 502, "unreachable");
            if (status === 401) throw new Owns3Error("owns3 rejected the api key.", 401, "unauthorized");
            if (status === 403) throw new Owns3Error(detail || "The owns3 api key lacks a required permission.", 403, "forbidden");
            if (status === 404) throw new Owns3Error(detail || "Object not found on owns3.", 404, "not_found");

            throw new Owns3Error(detail || `owns3 request failed (${status}).`, 502, "error");
        }
    }

    /** App, key permissions and bucket this key belongs to. */
    me() {
        return this.request<Owns3Me>(() => this.$api.get("/me"));
    }

    /** Metadata of an object, or throws `not_found`. */
    stat(path: string) {
        return this.request<Owns3Stat>(() => this.$api.get(`/stat/${encodePath(path)}`));
    }

    /** Flat listing of objects under a prefix. */
    list(prefix: string, limit = 100) {
        return this.request<Owns3Listing>(() => this.$api.get("/files", { params: { prefix, limit } }));
    }

    /**
     * Metadata of an object, using `stat` and falling back to a prefix listing
     * when stat fails for a reason other than "not found" (owns3 currently
     * returns a storage error from stat for some keys). Returns null when the
     * object does not exist.
     */
    async describe(path: string): Promise<Owns3Stat | null> {
        try {
            return await this.stat(path);
        } catch (e) {
            if (!(e instanceof Owns3Error)) throw e;
            if (e.code === "not_found") return null;
        }

        const listing = await this.list(path, 10);
        const object = listing.objects.find((o) => o.path === path);
        if (!object) return null;

        return { path, size: object.size, contentType: "", etag: object.etag, lastModified: object.lastModified };
    }

    /** Presigned PUT url the client uploads the raw body to. */
    presignUpload(path: string, expiresIn = 3600) {
        return this.request<Owns3Presigned>(() => this.$api.post("/presign/upload", { path, expiresIn }));
    }

    /** Presigned GET url the client can download from. */
    presignDownload(path: string, expiresIn = 3600) {
        return this.request<Owns3Presigned>(() => this.$api.post("/presign/download", { path, expiresIn }));
    }

    /** Current preview key of the app. Throws `forbidden` when preview links are off. */
    previewKey() {
        return this.request<Owns3PreviewKey>(() => this.$api.get("/preview-key"));
    }

    /** Delete an object. owns3 succeeds even when the object does not exist. */
    delete(path: string) {
        return this.request<{ ok: boolean; path: string }>(() => this.$api.delete(`/files/${encodePath(path)}`));
    }
}

/** Encode each path segment but keep the slashes. */
function encodePath(path: string) {
    return path.split("/").map(encodeURIComponent).join("/");
}

export default Owns3;

// ---------------------------------------------------------------------------
// Per-user helper
// ---------------------------------------------------------------------------
import User, { Owns3Config } from "../models/User";
import type { ObjectId } from "xpress-mongo";
import { decryptSecret } from "./Crypto";
import { env } from "../../env";

/** The app's default owns3 storage from env, or null when not configured. */
export function defaultOwns3(): Owns3 | null {
    const endpoint = env.OWNS3_DEFAULT_ENDPOINT;
    const apiKey = env.OWNS3_DEFAULT_API_KEY;

    if (!endpoint || !apiKey) return null;

    return new Owns3(normalizeOwns3Endpoint(endpoint), apiKey);
}

/**
 * owns3 client for a user, or null when they have not connected a server.
 * Users on the default storage resolve to the env configured server.
 */
export async function owns3ForUser(userId: ObjectId): Promise<Owns3 | null> {
    const user = await User.findById(userId, { projection: { owns3: 1, plan: 1 } });
    const config = user?.data.owns3;

    if (!config) return null;

    if (config.isDefault) {
        // The default storage is a Pro perk: stop resolving it once the plan lapses.
        if (user!.data.plan !== "pro") return null;

        const client = defaultOwns3();
        if (!client) console.error("[owns3] user is on default storage but OWNS3_DEFAULT_* env is not set.");
        return client;
    }

    if (!config.apiKey) return null;

    return new Owns3(config.endpoint, decryptSecret(config.apiKey));
}

export const OWNS3_REQUIRED_PERMISSIONS: Owns3Permission[] = ["read", "write", "delete"];

// ---------------------------------------------------------------------------
// Preview links
// ---------------------------------------------------------------------------

/** Preview keys live for minutes, so one fetch is reused by every request in that window. */
const previewKeyCache = new Map<string, { key: Owns3PreviewKey; expiresAt: number }>();
const PREVIEW_KEY_MARGIN = 30_000;

/**
 * Preview key for a client, cached until shortly before it expires.
 * Returns null when the app has preview links disabled (or the key cannot read).
 */
export async function previewKeyFor(client: Owns3, cacheKey: string): Promise<Owns3PreviewKey | null> {
    const cached = previewKeyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.key;

    let key: Owns3PreviewKey;
    try {
        key = await client.previewKey();
    } catch (e) {
        // 403 means preview links are off for the app: not an error the user can act on here.
        if (e instanceof Owns3Error && e.status === 403) return null;
        throw e;
    }

    const expiresAt = new Date(key.expiresAt).getTime();
    previewKeyCache.set(cacheKey, {
        key,
        expiresAt: (isNaN(expiresAt) ? Date.now() + key.ttlMinutes * 60_000 : expiresAt) - PREVIEW_KEY_MARGIN
    });

    return key;
}

/** Public preview url of an object, built from a preview key. */
export function previewUrl(key: Owns3PreviewKey, path: string) {
    return key.baseUrl.replace(/\/+$/, "") + "/" + path.split("/").map(encodeURIComponent).join("/");
}

// ---------------------------------------------------------------------------
// Status shown to the client
// ---------------------------------------------------------------------------

/** Whether a user can upload files, and with whose storage. Never includes the api key. */
export function owns3Status(config?: Owns3Config, plan?: string | null) {
    const defaultAvailable = defaultOwns3() !== null;

    if (!config) return { connected: false as const, default: false, defaultAvailable };

    // Default storage only works while the user is Pro.
    if (config.isDefault && plan !== "pro") {
        return { connected: false as const, default: true, defaultAvailable, proRequired: true };
    }

    return {
        connected: true as const,
        default: !!config.isDefault,
        defaultAvailable,
        endpoint: config.endpoint,
        app: config.app,
        permissions: config.permissions,
        connectedAt: config.connectedAt
    };
}

/** The same flags without the server details, small enough for every `ping`. */
export function owns3Summary(config?: Owns3Config, plan?: string | null) {
    const { connected, default: isDefault, defaultAvailable, ...rest } = owns3Status(config, plan);

    return {
        connected,
        default: isDefault,
        defaultAvailable,
        ...("proRequired" in rest ? { proRequired: true } : {})
    };
}
