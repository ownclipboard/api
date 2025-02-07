import { XMongoModel } from "xpress-mongo";
import { escapeRegexp } from "xpress-mongo/fn/helpers";
import { XMongoStrictConfig } from "xpress-mongo/src/types";

class BaseModel extends XMongoModel {
    static strict: XMongoStrictConfig = true;

    // Array of publicFields
    static publicFields: string[];

    /**
     * Returns the public field defined in a model.
     */


    /**
     * Returns mongodb projection query using public fields
     */
    // static projectPublicFields(): any {
    //     return omitIdAndPick(this.publicFields);
    // }

    /**
     * Get publicId helper
     * @example
     *  content.publicId()
     */
    uuid(): string {
        return this.data.uuid;
    }

    /**
     * Search Model.
     * @param query
     * @param fields
     * @param options
     */
    static search(
        query: string,
        fields: string | string[],
        options?: {
            where?: Record<string, any>;
            caseInsensitive?: boolean;
        }
    ) {
        const $options = Object.assign(
            {
                where: {},
                caseInsensitive: false,
                queryOptions: {}
            },
            options || {}
        );

        if (typeof fields === "string") fields = [fields];
        const $or: any[] = [];

        fields.forEach((field) => {
            $or.push({
                [field]: new RegExp(
                    `.*${escapeRegexp(query)}.*`,
                    $options.caseInsensitive ? "i" : undefined
                )
            });
        });

        return { $or, ...$options.where };
    }

}

export default BaseModel;
