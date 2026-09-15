import JobHelper from "xpresser/src/Console/JobHelper";
import User from "../../models/User";
import Subscription from "../../models/Subscription";

/**
 *  Job: subscriptions/expire
 *
 *  Downgrades users on the `pro` plan who no longer have an
 *  active, unexpired subscription (trial or paid) back to `free`.
 *
 *  Run: xjs run subscriptions/expire
 *  Schedule it with cron, e.g. once an hour.
 */
export = {
    // Job Handler
    async handler(args: string[], job: JobHelper): Promise<any> {
        const proUsers = await User.native()
            .find({ plan: "pro" }, { projection: { _id: 1, username: 1 } })
            .toArray();

        let downgraded = 0;

        for (const user of proUsers) {
            const current = await Subscription.findCurrentForUser(user._id);
            if (current) continue;

            await User.native().updateOne({ _id: user._id, plan: "pro" }, { $set: { plan: "free" } });
            downgraded++;
            job.$.log(`Downgraded ${user.username} to free.`);
        }

        job.$.logSuccess(`Checked ${proUsers.length} pro user(s), downgraded ${downgraded}.`);

        // End current job process.
        return job.end();
    }
};
