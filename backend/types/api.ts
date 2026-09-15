/**
 * Public API types.
 *
 * Every exported type in this file is converted to a JSON schema by
 * `npm run docs:build` and exposed under `components.schemas` in the
 * OpenAPI document, so controller docs can `$ref` them and the client
 * can generate matching TypeScript types with `openapi-typescript`.
 *
 * Only put request/response shapes here, never raw model types
 * (they contain private fields such as passwords and ObjectIds).
 */
import type { SubStat as SubscriptionStat } from "../models/Subscription";

/** Standard error body. */
export interface ErrorResponse {
    /** Human readable error message. */
    error: string;
    /** Name of the request field that failed validation, when applicable. */
    field?: string;
}

/** Simple message body. */
export interface MessageResponse {
    message: string;
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

/** Public view of a subscription. */
export type Subscription = SubscriptionStat;

export interface SubscribeBody {
    plan: "pro";
    /** Billing period. */
    type: "monthly" | "yearly";
    /** Number of months or years, 1 to 5. */
    duration: number;
}

export interface SubscribeResponse {
    subscription: Subscription;
    /** Hosted invoice to redirect the user to. */
    invoice?: Subscription["invoice"];
    message: string;
}

export interface SubscriptionStatusResponse {
    /** Latest active subscription. May be expired, check `expired`. */
    subscription: Subscription | null;
    /** Pending (unpaid) subscriptions with their invoices, newest first. */
    pending: Subscription[];
}

export interface CancelSubscriptionBody {
    /** `publicId` of a pending subscription. */
    subscription: string;
}

export interface CancelSubscriptionResponse {
    subscription: Subscription;
    message: string;
}

// ---------------------------------------------------------------------------
// Clips
// ---------------------------------------------------------------------------

/** Public view of a clip. */
export interface Clip {
    publicId: string;
    title?: string;
    type: "text" | "url" | "html" | "file";
    /** Slug of the folder the clip is in. */
    folder: string;
    /** The clip content. Ciphertext when `encrypted` is true. Always "File Clip" for file clips. */
    context: string;
    /** Present on file clips (`type` is `file`). The file name is the default title; size is on the clip. */
    file?: FileSummary;
    locked?: boolean | null;
    favorite?: boolean | null;
    encrypted?: boolean | null;
    updatedAt?: string;
}

export interface PaginatedClips {
    page: number;
    perPage: number;
    total: number;
    lastPage: number;
    data: Clip[];
}

export interface SearchClipsResponse {
    clips: PaginatedClips;
    /** The trimmed search query that was used. */
    query: string;
}

export interface TransferClipsBody {
    /** `publicId`s of the clips to copy or move, 1 to 100. */
    ids: string[];
    /** Target folder name or slug. Must not be an encrypted folder. */
    folder: string;
}

export type TransferSkipReason = "not_found" | "encrypted" | "same_folder" | "file";

export interface TransferSkipped {
    id: string;
    reason: TransferSkipReason;
}

export interface MoveClipsResponse {
    /** Slug of the target folder. */
    folder: string;
    /** Clips moved. */
    moved: { id: string }[];
    /** Clips that already existed in the target: the existing clip was touched and the source deleted. */
    merged: string[];
    skipped: TransferSkipped[];
    message: string;
}

export interface CopyClipsResponse {
    /** Slug of the target folder. */
    folder: string;
    /** Clips copied, with the `publicId` of each new copy. */
    copied: { id: string; copyId: string }[];
    /** Clips that already existed in the target: the existing clip was touched. */
    merged: string[];
    skipped: TransferSkipped[];
    message: string;
}

// ---------------------------------------------------------------------------
// Auth & account
// ---------------------------------------------------------------------------

/** Public view of the authenticated user. */
export interface AuthUser {
    username: string;
    publicId: string;
    email?: string;
    joinedAt: string;
    plan?: "free" | "pro" | null;
}

export interface PingResponse {
    user: AuthUser | null;
    /** File storage of the account, for deciding whether to offer uploads. */
    storage: StorageSummary;
    /** Latest active subscription, if any. */
    subscription?: Subscription;
}

/** Short view of the user's file storage. The full view is `GET account/owns3`. */
export interface StorageSummary {
    /** Whether files can be uploaded right now. */
    connected: boolean;
    /** True when the storage in use is the app's default one, not the user's own server. */
    default: boolean;
    /** Whether this server offers a default storage at all. */
    defaultAvailable: boolean;
    /** Set when the user picked the default storage but is no longer Pro. `connected` is false until they renew or connect their own server. */
    proRequired?: boolean;
}

export interface LoginBody {
    /** 3 to 250 alphanumeric characters. */
    username: string;
    /** 6 to 500 characters. */
    password: string;
}

export interface LoginResponse {
    /** JWT to send in the `oc-token` header. */
    token: string;
    plan: "free" | "pro" | null;
}

export interface SignupBody extends LoginBody {
    /** Optional. Must be unique; stored trimmed and lower-cased. Used for password resets. */
    email?: string;
}

export interface CheckUsernameBody {
    username: string;
}

export interface CheckUsernameResponse {
    /** Whether the username is already taken. */
    exists: boolean;
}

export interface SetPlanBody {
    /** Choosing `pro` for the first time starts a 7 day trial. */
    plan: "free" | "pro";
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

/** Public view of a folder. */
export interface Folder {
    name: string;
    slug: string;
    /** Number of clips in the folder. Only present in the folder list. */
    contents?: number;
    visibility: "public" | "private" | "encrypted";
    hasPassword?: boolean | null;
    /** Present when public paste is enabled. */
    publicPaste?: { id: string; date: string };
}

export interface CreateFolderBody {
    /** Folder name, must be unique per user. The slug is derived from it. */
    name: string;
    /**
     * `encrypted` marks a folder whose clips the client encrypts before sending.
     * Fixed at creation, it cannot be changed afterwards. Defaults to `public`.
     */
    visibility?: "public" | "encrypted";
}

export interface RenameFolderBody {
    /** New folder name, up to 100 characters. The slug is derived from it. */
    name: string;
}

export interface FolderPasswordBody {
    /** MD5 hash (32 hex characters) of the password chosen by the user. */
    password: string;
}

export interface CheckFolderPasswordResponse {
    match: boolean;
}

export interface PublicFolderResponse {
    folder: Folder;
}

// ---------------------------------------------------------------------------
// Clips (paste, list, find, update, delete)
// ---------------------------------------------------------------------------

export interface PasteBody {
    title?: string;
    content: string;
    /** Target folder name or slug. Defaults to `clipboard`. */
    folder?: string;
}

export interface PasteResponse {
    clip: Clip;
}

export interface PublicPasteBody {
    title?: string;
    content: string;
}

export interface PublicPasteResponse {
    clip: Clip;
    /** Present when a new clip was created. */
    message?: string;
    /** Present when identical content already existed and was only touched. */
    info?: string;
}

export interface FindClipsBody {
    /** `publicId`s of clips that were created through public paste. */
    ids: string[];
}

export interface FindClipsResponse {
    clips: PaginatedClips;
}

export interface ClipsListResponse {
    clips: PaginatedClips;
    /** Warning, e.g. the encrypted folder has no password set yet. */
    info?: string;
}

export interface UpdateClipBody {
    title?: string;
    content?: string;
}

export interface DeleteClipBody {
    /** Required only for encrypted clips: MD5 hash of the folder password. */
    password?: string;
}

// ---------------------------------------------------------------------------
// owns3 & files
// ---------------------------------------------------------------------------

export interface Owns3ConnectBody {
    /** Base url of the owns3 server, e.g. `https://owns3.example.com`. */
    endpoint: string;
    /** Application api key with read, write and delete permissions. */
    apiKey: string;
}

export interface Owns3App {
    id: string;
    name: string;
    slug: string;
    /** Folder prefix the app is confined to. */
    folder: string;
}

export interface Owns3Status {
    connected: boolean;
    /** True when the connected storage is the app's default one. */
    default: boolean;
    /** Whether the server offers a default storage (`POST account/owns3/use-default`, Pro only). */
    defaultAvailable: boolean;
    /** Set when the user chose the default storage but is no longer Pro: `connected` is false until they renew. */
    proRequired?: boolean;
    endpoint?: string;
    app?: Owns3App;
    permissions?: ("read" | "write" | "delete")[];
    connectedAt?: string;
}

export interface Owns3ConnectResponse extends Owns3Status {
    bucket: string;
    message: string;
}

export interface Owns3DisconnectResponse {
    connected: false;
    /** Uploaded files that stay on the server and become unavailable. */
    files: number;
    message: string;
}

/** File reference embedded in a clip. */
export interface FileSummary {
    publicId: string;
    /** Lower-cased extension without the dot, empty when none. */
    ext: string;
}

/** Public view of a file record. */
export interface File {
    publicId: string;
    name: string;
    /** Clip title, defaults to the file name. */
    title: string;
    /** Lower-cased extension without the dot, empty when none. */
    ext: string;
    /** Slug of the folder the clip lives in. */
    folder: string;
    /** Bytes. Declared size until confirmed, then the real size. */
    size: number;
    contentType: string;
    status: "pending" | "uploaded";
    createdAt: string;
    uploadedAt?: string | null;
}

export interface FileUploadBody {
    /** Original file name, up to 255 characters. */
    name: string;
    /** Optional clip title. Defaults to the file name. */
    title?: string;
    /** MIME type, defaults to application/octet-stream. */
    contentType?: string;
    /** Declared size in bytes, informational. */
    size?: number;
    /** Target folder name or slug. Defaults to clipboard. Encrypted folders are refused. */
    folder?: string;
}

export interface FileUploadResponse {
    file: File;
    upload: {
        method: "PUT";
        /** Presigned S3 url. PUT the raw file body here with the given headers. */
        url: string;
        expiresIn: number;
        headers: { "Content-Type": string };
    };
}

export interface FileConfirmResponse {
    file: File;
    clip?: Clip;
    message?: string;
    info?: string;
}

export interface FileUrlResponse {
    /** Presigned download url. */
    url: string;
    method: "GET";
    expiresIn: number;
}

export interface SetEmailBody {
    /** Trimmed and lower-cased before saving. Must not belong to another account. */
    email: string;
    /** The account password. */
    password: string;
}

export interface SetEmailResponse {
    /** The address as stored. */
    email: string;
    message: string;
}

export interface ChangePasswordBody {
    currentPassword: string;
    /** 6 to 500 characters. */
    newPassword: string;
}

export interface ChangePasswordResponse {
    /** New jwt for this device. Replace the stored `oc-token` with it. */
    token: string;
    message: string;
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

/** Public view of a device. The api key is never included. */
export interface Device {
    publicId: string;
    name: string;
    /** Slug of the folder the device reads from and writes to. */
    folder: string;
    /** A disabled device's key is refused by the legacy api. */
    enabled: boolean;
    /** Number of legacy api calls made with this key. */
    hits: number;
    /** Last characters of the api key, to tell devices apart. */
    keyHint: string;
    /** Whether the key has been connected through the legacy `connect` endpoint. */
    connected: boolean;
    /** `device_id` the app sent when it connected. */
    usedBy?: string;
    lastUsedAt?: string | null;
    createdAt: string;
}

export interface DeviceListResponse {
    devices: Device[];
    limit: {
        /** Devices allowed on the current plan. `null` means unlimited. */
        max: number | null;
        used: number;
    };
}

export interface CreateDeviceBody {
    /** 2 to 50 characters. */
    name: string;
    /** Folder name or slug the device uses. Defaults to clipboard. Encrypted folders are refused. */
    folder?: string;
}

/** The api key is only ever returned here, when created or rotated. */
export interface CreateDeviceResponse {
    device: Device;
    /** 100 character api key. Shown once, only its hash is stored. */
    apiKey: string;
    message: string;
}

export interface RenameDeviceBody {
    name: string;
}

export interface SetDeviceFolderBody {
    /** Folder name or slug. */
    folder: string;
}

export interface DeviceResponse {
    device: Device;
    message: string;
}

// ---------------------------------------------------------------------------
// Legacy api (/api/legacy)
// ---------------------------------------------------------------------------

/** A clip as the first OwnClipboard platform returned it. */
export interface LegacyClip {
    /** Clip id, called `code` on the old platform. */
    code: string;
    type: "text" | "url";
    content: string;
    /** 0 or 1, as the old sqlite rows had it. */
    locked: number;
    /** 0 or 1, as the old sqlite rows had it. */
    favorite: number;
    /** `YYYY-MM-DD HH:MM:SS`, UTC. */
    created_at: string | null;
    /** Content with html entities escaped and newlines turned into `<br>`. */
    html_formatted: string;
}

export interface LegacyClipsResponse {
    status: number;
    data: {
        /** Echo of the `search` query, absent when none was sent. */
        search?: string;
        clips: {
            total: number;
            perPage: number;
            page: number;
            lastPage: number;
            data: LegacyClip[];
        };
    };
}

/** Error envelope of the legacy api. */
export interface LegacyErrorResponse {
    status: number;
    error: {
        /** `api_key_not_found`, `api_key_not_valid`, `api_key_not_connected`, `clip_not_found`, `clip_not_valid`, `empty_content` or `404`. */
        type: string;
        message: string;
    };
}
