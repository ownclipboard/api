import slugify from "slugify";
import Folder, { FolderDataType } from "../models/Folder";
import type { ObjectId } from "xpress-mongo";

/** How many devices a free account may have. Pro is unlimited. */
export const DEVICE_LIMIT_FREE = 3;

/** Device limit of a plan. `null` means unlimited. */
export function deviceLimitFor(plan?: string | null): number | null {
    return plan === "pro" ? null : DEVICE_LIMIT_FREE;
}

/**
 * Resolve the folder a device reads from and writes to.
 * Encrypted folders are refused: the legacy api sends and receives plain text.
 */
export async function resolveDeviceFolder(
    userId: ObjectId,
    folder: string
): Promise<{ error: string } | { folder: Folder }> {
    const slug = slugify(folder, { lower: true, replacement: "-" });
    const found = await Folder.findOne(<FolderDataType>{ userId, slug });

    if (!found) return { error: `No folder with name: '${folder}'` };
    if (found.isEncrypted()) {
        return { error: "Devices cannot be attached to an encrypted folder." };
    }

    return { folder: found };
}
