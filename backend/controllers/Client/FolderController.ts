import { Controller, Http } from "xpresser/types/http";
import Folder from "../../models/Folder";

/**
 * FolderController
 */
export = <Controller.Object>{
    // Controller Name
    name: "FolderController",

    // Controller Default Error Handler.
    e: (http: Http, error: string) => http.status(401).json({ error }),

    /**
     * Example Action.
     * @param http - Current Http Instance
     */
    async all(http) {
        const userId = http.authUserId();

        // return await Folder.find(
        //     { userId },
        //     {
        //         projection: Folder.projectPublicFields()
        //     }
        // );

        return await Folder.native()
            .aggregate([
                {
                    $match: { userId }
                },
                {
                    $lookup: {
                        from: "contents",
                        localField: "slug",
                        foreignField: "folder",
                        as: "contents"
                    }
                },
                {
                    $project: Folder.projectPublicFields()
                }
            ])
            .toArray();
    }
};
