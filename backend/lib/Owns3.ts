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
import User from "../models/User";
import type { ObjectId } from "xpress-mongo";
import { decryptSecret } from "./Crypto";

/**
 * owns3 client for a user, or null when they have not connected a server.
 */
export async function owns3ForUser(userId: ObjectId): Promise<Owns3 | null> {
    const user = await User.findById(userId, { projection: { owns3: 1 } });
    const config = user?.data.owns3;

    if (!config) return null;

    return new Owns3(config.endpoint, decryptSecret(config.apiKey));
}

export const OWNS3_REQUIRED_PERMISSIONS: Owns3Permission[] = ["read", "write", "delete"];
