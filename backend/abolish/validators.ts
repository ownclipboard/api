import { Abolish } from "abolish";
import User from "../models/User";
import slugify from "slugify";
import Folder from "../models/Folder";

Abolish.addGlobalValidator({
    name: "setAuthId",
    validator: async (value: any, authId: any, { modifier }) => {
        if (!authId) {
            throw new Error("You must be logged in to perform this action");
        }
        modifier.set("authId", authId);
    }
});

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

/**
 * FolderExist checks if folder exist or !exist in the database.
 */
Abolish.addGlobalValidator({
    isAsync: true,
    name: "FolderExists",
    validator: async (folder, shouldExist = true, { error, modifier }) => {
        // Get authId
        const userId = modifier.get("authId");

        // throe error if userId is not set.
        if (!userId) {
            throw new Error(`Rule: {setAuthId} must be applied before {FolderExists}`);
        }

        const slug = slugify(folder, { lower: true, replacement: "-" });

        // Check if folder exists and return only id.
        const folderExists = await Folder.exists({ slug, userId });

        // if should exist and does not exist
        if (shouldExist && !folderExists) {
            return error(`No folder with name: "${folder}"`);
        }

        // if should not exist and folder exists.
        else if (!shouldExist && folderExists) {
            return error(`Folder with name: "${folder}" already exists.`);
        }

        return true;
    }
});
