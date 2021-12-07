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
