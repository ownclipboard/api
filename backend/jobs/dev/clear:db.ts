import JobHelper from "xpresser/src/Console/JobHelper";
import { isProd } from "../../../env";
import User from "../../models/User";
import Folder from "../../models/Folder";
import Content from "../../models/Content";

/**
 *  Job: clear:db.ts
 */
export = {
    // Job Handler
    async handler(args: string[], job: JobHelper): Promise<any> {
        // Your Job Here
        if (isProd) {
            return job.$.log("This is a production environment, no need to clear database.");
        }

        // await User.native().deleteMany({});
        await Folder.native().deleteMany({});
        await Content.native().deleteMany({});

        const user = await User.findOne({ username: "ownclipboard" });

        if (!user) throw new Error("You need to create a user with username: ownclipboard");

        // Create Default Folders
        await Folder.create({ userId: user.id(), name: "Clipboard" });
        await Folder.create({
            userId: user.id(),
            name: "Encrypted",
            visibility: "encrypted"
        });

        job.$.logSuccess("Database cleared.");

        // End current job process.
        return job.end();
    }
};
