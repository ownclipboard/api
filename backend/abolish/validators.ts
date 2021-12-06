import { Abolish } from "abolish";
import User from "../models/User";

/**
 * UsernameExist checks if username exist or !exist in the database.
 */
Abolish.addGlobalValidator({
    isAsync: true,
    name: "UsernameExists",
    validator: async (username, shouldExist = true, { error, modifier }) => {
        // Check if username exists and return only id.
        const user = await User.native().findOne({ username }, { projection: { _id: 1 } });

        // if should exist and does not exist
        if (shouldExist && !user) {
            return error(`:param is not associated with any account.`);
        }

        // if should not exists and user exists.
        else if (!shouldExist && user) {
            return error(`:param already has an account.`);
        }

        // if should exists and user exits, append userId to form data.
        else if (shouldExist && user) {
            modifier.set("userId", user._id);
        }

        return true;
    }
});
