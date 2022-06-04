import { TodoFunction } from "xpresser/types";

/**
 * Set up the folder structure.
 */
export = ((next, $) => {
    // Get Express
    const express = require("express");

    // Get image uploads folder
    let uploadsFolder = $.config.syncWithInitial<string>("paths.uploads.images");

    if (!uploadsFolder.sync)
        return $.logError("Uploads folder config: {paths.upload.images} not found!");

    // Update config path to full path.
    uploadsFolder.changeTo($.path.storage(uploadsFolder.sync));

    if (!$.file.exists(uploadsFolder.sync))
        // Make directory if not exists.
        $.file.makeDirIfNotExist(uploadsFolder.sync);

    // Set static for uploads/images folder.
    $.app!.use("/uploads/images", express.static(uploadsFolder.sync));

    // Log success.
    $.logSuccess(`Uploads folder: [storage/${uploadsFolder.initial}]`);

    return next();
}) as TodoFunction;
