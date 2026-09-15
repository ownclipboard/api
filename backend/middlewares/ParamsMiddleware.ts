import { ParamsMiddleware } from "@xpresser/params-loader";
import Folder, { FolderDataType } from "../models/Folder";
import Content, { ContentDataType } from "../models/Content";
import File, { FileDataType } from "../models/File";
import Device, { DeviceDataType } from "../models/Device";

// Define your params
export = ParamsMiddleware({
    folder: {
        addToBoot: true,
        load: (folder, http) => {
            // Find folder using userId
            return Folder.findOne(<FolderDataType>{
                slug: folder,
                userId: http.authUserId()
            });
        },
        notFound: (http, folder) => {
            // If folder is not defined in params then it must be optional.
            if (http.hasParam("folder") && folder === undefined) return http.next();

            // If folder is not found then return 404
            return http.error(`Folder: '${folder}' not found!`, 404);
        }
    },

    clip: {
        addToBoot: true,
        load: (publicId, http) => {
            // Find clip by publicId, scoped to the authenticated user.
            return Content.findOne(<ContentDataType>{ publicId, userId: http.authUserId() });
        },
        notFound: (http, clip) => {
            // If clip is not found then return 404
            return http.error(`Clip with id: '${clip}' not found!`, 404);
        }
    },

    file: {
        addToBoot: true,
        load: (publicId, http) => {
            return File.findOne(<FileDataType>{ publicId, userId: http.authUserId() });
        },
        notFound: (http, file) => http.error(`File with id: '${file}' not found!`, 404)
    },

    device: {
        addToBoot: true,
        load: (publicId, http) => {
            return Device.findOne(<DeviceDataType>{ publicId, userId: http.authUserId() });
        },
        notFound: (http, device) => http.error(`Device with id: '${device}' not found!`, 404)
    },

    pasteId: {
        as: "folder",
        load: (pasteId) => {
            // find Folder by pasteId
            return Folder.findOne({
                "publicPaste.id": pasteId
            });
        },
        notFound: (http) => http.badRequestError("Paste folder not found or has expired!")
    }
});
