import { ParamsMiddleware } from "@xpresser/params-loader";
import Folder, { FolderDataType } from "../models/Folder";

// Define your params
export = ParamsMiddleware({
    folder: {
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
    }
});
