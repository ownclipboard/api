import * as fs from "node:fs";

/**
 * New line to <br/>
 * @param str
 * @param is_xhtml
 */
export function nl2br(str: string | undefined, is_xhtml: boolean = false) {
    if (!str) return "";

    const breakTag = is_xhtml ? "<br />" : "<br>";
    return (str + "").replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, "$1" + breakTag + "$2");
}

/**
 * Strip html entities off string.
 * @param rawStr
 */
export function htmlEntities(rawStr: string) {
    return rawStr.replace(/[\u00A0-\u9999<>&]/gim, (i) => {
        return "&#" + i.charCodeAt(0) + ";";
    });
}


/**
 * get file size number and string value.
 * @param filePath
 */
export function oc_fileSize(filePath: string) {
    const { size } = fs.statSync(filePath);
    return { bytes: size, human: oc_fileSizeToString(size) };
}

/**
 * Get size of the string data passed.
 */
export function oc_stringSize(str: string) {
   const size = new TextEncoder().encode(str).length;
   return { bytes: size, human: oc_fileSizeToString(size) };
}

/**
 * Convert string to human-readable text
 * E.g. 1MB, 45GB
 * @param size
 * @param decimals
 * @returns {string|*}
 */
export function oc_fileSizeToString(size: number, decimals = 2) {
    const bytes = size;
    if (bytes === 0) return "0Bytes";

    const k = 1024;
    const dm = decimals <= 0 ? 0 : decimals || 2;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}