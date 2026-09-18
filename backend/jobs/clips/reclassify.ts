import JobHelper from "xpresser/src/Console/JobHelper";
import Content from "../../models/Content";

/** Only the fields this job reads. */
type ClipRow = { _id: any; context: string; type: string };

/**
 *  Job: clips/reclassify
 *
 *  Recomputes the `type` of existing clips (`text` or `url`).
 *
 *  Link detection used to ask abolish's `url` validator, which is `new URL()` in a
 *  try/catch. That accepts any `word:` prefix as a scheme, so notes beginning with
 *  "Name:", "TODO:" or a Windows path were stored as links, while a bare "example.com"
 *  was stored as text. `Content.isUrl()` decides it now, and this job fixes what was
 *  written before.
 *
 *  Left alone: file clips, encrypted clips (their content is ciphertext) and anything
 *  whose type is neither `text` nor `url`.
 *
 *  Run: xjs run clips/reclassify [dry-run]
 */

const CHUNK = 500;

export = {
    // Job Handler
    async handler(args: string[], job: JobHelper): Promise<any> {
        // `xjs` rejects unknown dashed options, so the flag is a plain word.
        const dryRun = args.some((a) => /^-*dry-?run$/i.test(a));
        if (dryRun) job.$.logWarning("Dry run: nothing will be written.");

        const query = {
            type: { $in: ["text", "url"] },
            encrypted: { $ne: true },
            fileId: { $exists: false }
        };

        const stats = { scanned: 0, toUrl: 0, toText: 0, unchanged: 0 };
        let writes: any[] = [];

        const flush = async () => {
            if (!writes.length) return;
            if (!dryRun) await Content.native().bulkWrite(writes);
            writes = [];
        };

        const cursor = Content.native().find(query, { projection: { context: 1, type: 1 } });

        for await (const clip of cursor as AsyncIterable<ClipRow>) {
            stats.scanned++;

            const type = Content.isUrl(clip.context) ? "url" : "text";

            if (type === clip.type) {
                stats.unchanged++;
                continue;
            }

            type === "url" ? stats.toUrl++ : stats.toText++;

            // `updatedAt` is left as it is: the clip itself did not change.
            writes.push({ updateOne: { filter: { _id: clip._id }, update: { $set: { type } } } });

            if (writes.length >= CHUNK) await flush();
        }

        await flush();

        job.$.logSuccess(
            [
                dryRun ? "Dry run complete." : "Reclassify complete.",
                `Scanned ${stats.scanned} clip(s): ${stats.toText} link(s) corrected to text, ${stats.toUrl} text corrected to link, ${stats.unchanged} already right.`
            ].join("\n")
        );

        // End current job process.
        return job.end();
    }
};
