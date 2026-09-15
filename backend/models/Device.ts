import { CreateIndex, is, ObjectId, RefreshDateOnUpdate, XMongoSchema } from "xpress-mongo";
import { UseCollection } from "@xpresser/xpress-mongo";
import BaseModel from "./BaseModel";
import { createHash } from "crypto";
import { customAlphabet } from "nanoid";
import { PublicIdSchema } from "./schemas/schemas";

/**
 * A device is an api key an external app uses to read and write clips
 * through the legacy api at `/api/legacy/*`.
 *
 * The key itself is never stored: only its sha256 hash and the last few
 * characters, so it can be shown once and recognised in a list afterwards.
 */
export interface DeviceDataType {
    _id: ObjectId;
    publicId: string;
    userId: ObjectId;
    name: string;
    /** sha256 of the api key, hex. */
    keyHash: string;
    /** Last characters of the key, to tell devices apart in a list. */
    keyHint: string;
    /** Slug of the folder this device reads from and writes to. Never an encrypted folder. */
    folder: string;
    /** A disabled device's key is refused like an unknown one. */
    enabled: boolean;
    /** Number of legacy api calls made with this key. */
    hits: number;
    /** Set the first time the key is used, through the legacy `/api/legacy/connect`. */
    connectedAt?: Date;
    /** `device_id` the app sent when it connected. */
    usedBy?: string;
    lastUsedAt?: Date;
    updatedAt?: Date;
    createdAt: Date;
}

/** Keys are exactly 100 uppercase alphanumeric characters, as the legacy api requires. */
const API_KEY_LENGTH = 100;
const randomKey = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", API_KEY_LENGTH);

class Device extends BaseModel {
    /**
     * Model Schema
     */
    static schema: XMongoSchema<DeviceDataType> = {
        publicId: PublicIdSchema().required(),
        userId: is.ObjectId().required(),
        name: is.String().required(),
        keyHash: is.String().required(),
        keyHint: is.String().required(),
        folder: is.String("clipboard").required(),
        enabled: is.Boolean(true).required(),
        hits: is.Number(0).required(),
        connectedAt: is.Date().undefined(),
        usedBy: is.String().undefined(),
        lastUsedAt: is.Date().undefined(),
        updatedAt: is.Date(),
        createdAt: is.Date().required()
    };

    // SET Type of this.data.
    public data!: DeviceDataType;

    /** Length the legacy api expects every api key to have. */
    static readonly keyLength = API_KEY_LENGTH;

    /** Generate a new api key. Returned to the user once, never stored. */
    static generateApiKey(): string {
        return randomKey();
    }

    /** Hash used to look a key up. */
    static hashApiKey(key: string): string {
        return createHash("sha256").update(key).digest("hex");
    }

    /** Find the device an api key belongs to. */
    static findByApiKey(key: string) {
        return this.findOne({ keyHash: this.hashApiKey(key) }) as Promise<Device | null>;
    }

    /** Store a key on this device: its hash and its hint. */
    setApiKey(key: string) {
        this.data.keyHash = Device.hashApiKey(key);
        this.data.keyHint = key.slice(-6);

        return this;
    }

    /** Has the key been used through the legacy `connect` endpoint. */
    isConnected(): boolean {
        return !!this.data.connectedAt;
    }

    /** Public view. Never includes the key. */
    summary() {
        const d = this.data;

        return {
            publicId: d.publicId,
            name: d.name,
            folder: d.folder,
            enabled: d.enabled,
            hits: d.hits,
            keyHint: d.keyHint,
            connected: this.isConnected(),
            usedBy: d.usedBy,
            lastUsedAt: d.lastUsedAt,
            createdAt: d.createdAt
        };
    }
}

/**
 * Map Model to Collection: `devices`
 * .native() will be made available for use.
 */
UseCollection(Device, "devices");
CreateIndex(Device, "publicId", true);
CreateIndex(Device, "keyHash", true);
CreateIndex(Device, ["userId", "createdAt"]);

// Refresh "updatedAt" on update if has changes.
RefreshDateOnUpdate(Device, "updatedAt", true);

// Export Model as Default
export default Device;
