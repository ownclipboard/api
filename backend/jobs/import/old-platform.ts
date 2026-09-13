import JobHelper from "xpresser/src/Console/JobHelper";
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "fs";
import { resolve } from "path";
import { ObjectId } from "xpress-mongo";
import User, { UserDataType } from "../../models/User";
import Folder from "../../models/Folder";
import Content, { ContentDataType } from "../../models/Content";
import Device, { DeviceDataType } from "../../models/Device";
import { oc_stringSize } from "../../functions";

/**
 *  Job: import/old-platform
 *
 *  Imports users and their clips from the old OwnClipboard platform (sqlite).
 *  Only the `users` and `contents` tables are read, every clip lands in the
 *  user's default `clipboard` folder.
 *
 *  - Old bcrypt password hashes are reused, so users keep their passwords.
 *  - A username that already exists here is merged: the existing account is
 *    kept untouched and only the old clips are added to its clipboard.
 *  - Clips that already exist in the clipboard (same content) are skipped,
 *    so the job can be re-run safely.
 *  - Old emails are kept unless another account already uses them.
 *  - Old timestamps are kept (`joinedAt`, clip `createdAt`/`updatedAt`).
 *  - Devices are imported too, so apps keep working against `/api/old/*` with the
 *    api keys they already hold. Only the hash of each key is stored.
 *
 *  Run: xjs run import/old-platform /path/to/database.sqlite [dry-run]
 */

type OldUser = {
    id: number;
    username: string;
    email: string | null;
    password: string;
    created_at: string | number | null;
};

type OldDevice = {
    name: string | null;
    api_key: string;
    hits: number | null;
    used: number | null;
    used_by: string | null;
    created_at: string | number | null;
};

type OldContent = {
    code: string;
    content: string | null;
    locked: number | null;
    favorite: number | null;
    created_at: string | number | null;
    updated_at: string | number | null;
};

const CLIPBOARD = "clipboard";
const INSERT_CHUNK = 500;

/** Parse the timestamps knex/sqlite wrote (`YYYY-MM-DD HH:MM:SS` in UTC, iso or epoch). */
function parseDate(value: string | number | null | undefined, fallback: Date): Date {
    if (value === null || value === undefined || value === "") return fallback;

    let date: Date;
    if (typeof value === "number") {
        date = new Date(value < 1e12 ? value * 1000 : value);
    } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
        date = new Date(value.replace(" ", "T") + "Z");
    } else {
        date = new Date(value);
    }

    return isNaN(date.getTime()) ? fallback : date;
}

export = {
    // Job Handler
    async handler(args: string[], job: JobHelper): Promise<any> {
        // `xjs` rejects unknown dashed options, so the flag is a plain word.
        const dryRun = args.some((a) => /^-*dry-?run$/i.test(a));
        const dbPath = args.find((a) => !/^-*dry-?run$/i.test(a));

        if (!dbPath) {
            job.$.logError("Usage: xjs run import/old-platform /path/to/database.sqlite [dry-run]");
            return job.end();
        }

        const file = resolve(dbPath);
        if (!existsSync(file)) {
            job.$.logError(`Sqlite file not found: ${file}`);
            return job.end();
        }

        const db = new DatabaseSync(file, { readOnly: true });
        if (dryRun) job.$.logWarning("Dry run: nothing will be written.");

        const stats = {
            users: 0,
            created: 0,
            merged: 0,
            skipped: 0,
            clips: 0,
            imported: 0,
            duplicates: 0,
            empty: 0,
            emailsDropped: 0,
            devices: 0,
            devicesImported: 0,
            devicesSkipped: 0
        };

        // Emails claimed earlier in this run, so clashes inside the import are caught in dry runs too.
        const claimedEmails = new Set<string>();

        try {
            const oldUsers = db
                .prepare(`SELECT id, username, email, password, created_at FROM users ORDER BY id`)
                .all() as unknown as OldUser[];

            const contentsQuery = db.prepare(
                `SELECT code, content, locked, favorite, created_at, updated_at FROM contents WHERE user_id = ? ORDER BY id`
            );

            // The devices table holds the api keys old apps still use.
            const hasDevices = !!db
                .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'devices'`)
                .get();

            const devicesQuery = hasDevices
                ? db.prepare(
                      `SELECT name, api_key, hits, used, used_by, created_at FROM devices WHERE user_id = ? ORDER BY id`
                  )
                : null;

            stats.users = oldUsers.length;
            job.$.log(`Found ${oldUsers.length} user(s) in ${file}`);

            for (const oldUser of oldUsers) {
                const username = String(oldUser.username || "")
                    .trim()
                    .toLowerCase();

                if (!username) {
                    stats.skipped++;
                    job.$.logWarning(`#${oldUser.id}: empty username, skipped.`);
                    continue;
                }

                const rows = contentsQuery.all(oldUser.id) as unknown as OldContent[];
                stats.clips += rows.length;

                // Find or create the user.
                let userId: ObjectId;
                const existing = await User.findOne({ username }, { projection: { _id: 1 } });

                if (existing) {
                    userId = existing.id();
                    stats.merged++;
                    job.$.log(`${username}: exists, merging ${rows.length} clip(s) into it.`);
                } else {
                    const email = await importableEmail(oldUser.email, username, claimedEmails, job, stats);

                    if (!/^\$2[aby]\$/.test(oldUser.password || "")) {
                        job.$.logWarning(`${username}: password hash is not bcrypt, the user will not be able to log in.`);
                    }

                    const user = User.make(<UserDataType>{
                        username,
                        password: oldUser.password,
                        joinedAt: parseDate(oldUser.created_at, new Date()),
                        ...(email ? { email } : {})
                    });

                    if (!dryRun) {
                        await user.save();
                        await user.createDefaultFolders();
                    }

                    // In a dry run nothing is saved, so use a throwaway id for clip validation.
                    userId = dryRun ? new ObjectId() : user.id();
                    stats.created++;
                    job.$.log(`${username}: created with ${rows.length} clip(s).`);
                }

                if (devicesQuery) {
                    const deviceRows = devicesQuery.all(oldUser.id) as unknown as OldDevice[];
                    stats.devices += deviceRows.length;

                    for (const row of deviceRows) {
                        const imported = await importDevice(row, userId, username, dryRun, job);
                        imported ? stats.devicesImported++ : stats.devicesSkipped++;
                    }
                }

                if (!rows.length) continue;

                if (!dryRun) await ensureClipboardFolder(userId);

                // Existing clipboard contents, so re-runs and old duplicates are skipped.
                const seen = new Set<string>();
                if (existing) {
                    const cursor = Content.native().find(
                        { userId, folder: CLIPBOARD, fileId: { $exists: false } },
                        { projection: { context: 1 } }
                    );
                    for await (const doc of cursor) seen.add(doc.context);
                }

                const docs: ContentDataType[] = [];

                for (const row of rows) {
                    const context = (row.content || "").trim();

                    if (!context) {
                        stats.empty++;
                        continue;
                    }

                    if (seen.has(context)) {
                        stats.duplicates++;
                        continue;
                    }

                    seen.add(context);

                    const createdAt = parseDate(row.created_at, new Date());
                    const clip = Content.make(<ContentDataType>{
                        userId,
                        context,
                        folder: CLIPBOARD,
                        locked: !!row.locked,
                        favorite: !!row.favorite,
                        createdAt,
                        updatedAt: parseDate(row.updated_at, createdAt)
                    }).setContextType();

                    clip.data.size = oc_stringSize(context);

                    docs.push(clip.validate());
                }

                if (!dryRun) {
                    for (let i = 0; i < docs.length; i += INSERT_CHUNK) {
                        await Content.native().insertMany(docs.slice(i, i + INSERT_CHUNK));
                    }
                }

                stats.imported += docs.length;
            }
        } finally {
            db.close();
        }

        job.$.logSuccess(
            [
                dryRun ? "Dry run complete." : "Import complete.",
                `Users: ${stats.users} (created ${stats.created}, merged ${stats.merged}, skipped ${stats.skipped}, emails dropped ${stats.emailsDropped})`,
                `Clips: ${stats.clips} (imported ${stats.imported}, duplicates ${stats.duplicates}, empty ${stats.empty})`,
                `Devices: ${stats.devices} (imported ${stats.devicesImported}, skipped ${stats.devicesSkipped})`
            ].join("\n")
        );

        // End current job process.
        return job.end();
    }
};

/** Normalised old email, or undefined when missing, invalid or already taken by another account. */
async function importableEmail(
    raw: string | null,
    username: string,
    claimed: Set<string>,
    job: JobHelper,
    stats: { emailsDropped: number }
): Promise<string | undefined> {
    const email = String(raw || "")
        .trim()
        .toLowerCase();
    if (!email) return undefined;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        stats.emailsDropped++;
        job.$.logWarning(`${username}: email "${email}" is invalid, dropped.`);
        return undefined;
    }

    if (claimed.has(email) || (await User.exists({ email }))) {
        stats.emailsDropped++;
        job.$.logWarning(`${username}: email "${email}" already belongs to another account, dropped.`);
        return undefined;
    }

    claimed.add(email);
    return email;
}

/**
 * Import one device, keeping its api key working. Only the key's hash is stored.
 * Returns false when the device was skipped.
 */
async function importDevice(
    row: OldDevice,
    userId: ObjectId,
    username: string,
    dryRun: boolean,
    job: JobHelper
): Promise<boolean> {
    const apiKey = String(row.api_key || "");

    // Keys of another length were already refused by the old api.
    if (apiKey.length !== Device.keyLength) {
        job.$.logWarning(`${username}: device key is not ${Device.keyLength} characters, skipped.`);
        return false;
    }

    // Already imported by an earlier run.
    if (await Device.exists({ keyHash: Device.hashApiKey(apiKey) })) return false;

    const createdAt = parseDate(row.created_at, new Date());
    const name = String(row.name || "").trim() || "Imported device";

    const device = Device.make(<DeviceDataType>{
        userId,
        name,
        folder: CLIPBOARD,
        // The old api ignored this flag, so every imported key keeps working.
        enabled: true,
        hits: row.hits || 0,
        createdAt,
        ...(row.used ? { connectedAt: createdAt } : {}),
        ...(row.used_by ? { usedBy: String(row.used_by) } : {})
    }).setApiKey(apiKey);

    if (!dryRun) await device.save();

    return true;
}

/** Merged accounts should always have a clipboard folder, create it if it went missing. */
async function ensureClipboardFolder(userId: ObjectId) {
    const exists = await Folder.exists({ userId, slug: CLIPBOARD });
    if (!exists) await Folder.create({ userId, name: "Clipboard" });
}
