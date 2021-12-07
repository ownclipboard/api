import JobHelper from "xpresser/src/Console/JobHelper";
import { isProd } from "../../../env";
import User from "../../models/User";
import Folder from "../../models/Folder";

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

        await User.native().deleteMany({});
        await Folder.native().deleteMany({});

        job.$.logSuccess("Database cleared.");

        // End current job process.
        return job.end();
    }
};
