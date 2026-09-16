import Ably from "ably";
import type { ObjectId } from "xpress-mongo";
import User from "../models/User";
import { env } from "../../env";

/**
 * Realtime notifications over Ably (https://ably.com).
 *
 * Every user has one channel, `user:<publicId>`, which only exists while one of their
 * devices is attached. Messages carry ids and folder slugs, never clip content, so the
 * client is told *that* something changed and refetches it over this api. Clip text,
 * encrypted or not, never reaches a third party.
 *
 * Publishing is best effort: a realtime outage must never fail a request.
 * With no `ABLY_API_KEY` set, everything here is a no-op and the app behaves as before.
 */

export type RealtimeEvent = "clip.new" | "clip.updated" | "clip.deleted" | "clips.changed";

export interface ClipEventData {
    /** publicId of the clip. */
    id: string;
    /** Slug of the folder it lives in. */
    folder: string;
    /** Set when the clip is a file clip, so a gallery knows to refresh too. */
    kind?: "file";
    /** Ably connectionId of the device that caused this, when it told us. */
    from?: string;
}

export interface ClipsChangedData {
    /** Folder slugs whose contents changed. */
    folders: string[];
    created?: number;
    updated?: number;
    deleted?: number;
    from?: string;
}

export type RealtimeData = ClipEventData | ClipsChangedData;

let client: Ably.Rest | null = null;

/** Whether realtime is configured on this server. */
export function realtimeEnabled(): boolean {
    return !!env.ABLY_API_KEY;
}

/** Channel a user listens on. */
export function userChannel(publicId: string): string {
    return `user:${publicId}`;
}

/** Lazy Ably REST client. REST, so the api holds no persistent connection. */
function rest(): Ably.Rest | null {
    if (!realtimeEnabled()) return null;
    if (!client) client = new Ably.Rest({ key: env.ABLY_API_KEY! });

    return client;
}

/**
 * Publish to a user's channel. Never awaited by callers and never throws:
 * a failure is logged and the request carries on.
 */
export function publishToUser(publicId: string, event: RealtimeEvent, data: RealtimeData): void {
    const ably = rest();
    if (!ably || !publicId) return;

    ably.channels
        .get(userChannel(publicId))
        .publish(event, data)
        .catch((e: Error) => console.error(`[realtime] ${event}:`, e.message));
}

/**
 * Same, for the one path where the actor is not the owner (public paste):
 * resolves the owner's publicId first.
 */
export function publishToUserId(userId: ObjectId, event: RealtimeEvent, data: RealtimeData): void {
    if (!realtimeEnabled()) return;

    User.findById(userId, { projection: { publicId: 1 } })
        .then((user) => {
            if (user) publishToUser(user.data.publicId, event, data);
        })
        .catch((e: Error) => console.error(`[realtime] ${event} lookup:`, e.message));
}

/**
 * Signed token request for a client. It can only subscribe, only to its own channel:
 * the api key itself never leaves this server.
 */
export function createRealtimeToken(publicId: string) {
    const ably = rest();
    if (!ably) return null;

    return ably.auth.createTokenRequest({
        clientId: publicId,
        capability: { [userChannel(publicId)]: ["subscribe"] }
    });
}

/** Connection id the calling device sent, so it can ignore its own events. */
export function connectionIdOf(headers: Record<string, any>): string | undefined {
    const id = headers["oc-connection"];
    return typeof id === "string" && id.length && id.length <= 64 ? id : undefined;
}
