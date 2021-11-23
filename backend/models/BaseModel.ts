import { omitIdAndPick, XMongoModel } from "xpress-mongo";
import { XMongoStrictConfig } from "xpress-mongo/src/CustomTypes";
import { escapeRegexp } from "xpress-mongo/fn/helpers";

class BaseModel extends XMongoModel {
    static strict: XMongoStrictConfig = true;

    // Array of publicFields
    static publicFields: string[];

    /**
     * Returns the public field defined in a model.
     */
    getPublicFields() {
        return this.toCollection().pick(this.$static<typeof BaseModel>().publicFields);
    }

    /**
     * Returns mongodb projection query using public fields
     */
    static projectPublicFields(): any {
        return omitIdAndPick(this.publicFields);
    }

    /**
     * Get uuid helper
     * @example
     *  content.uuid()
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

export function IndexUuid(Model: typeof XMongoModel) {
    Model.native().createIndex({ uuid: 1 }).catch(console.log);
}

export default BaseModel;
