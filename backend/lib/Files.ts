import type Owns3 from "./Owns3";
import File from "../models/File";
import Content from "../models/Content";

/** Fixed `context` of every file clip. The file name lives in the title and on the file record. */
export const FILE_CLIP_CONTEXT = "File Clip";

/**
 * Delete a file everywhere: the object on owns3, its clip and its record.
 */
export async function destroyFile(file: File, owns3: Owns3) {
    if (file.data.path) {
        await owns3.delete(file.data.path);
    }

    if (file.data.clipId) {
        await Content.native().deleteOne({ _id: file.data.clipId });
    }

    await file.delete();
}
