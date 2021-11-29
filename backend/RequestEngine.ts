import { ObjectId } from "xpress-mongo";
import { $ } from "../xpresser";

const XpresserRequestEngine = $.engineData.get(
    "ExtendedRequestEngine"
) as () => typeof import("xpresser/src/RequestEngine");

class RequestEngine extends XpresserRequestEngine() {
    /**
     * Get current authenticated userId
     */
    authUserId(): ObjectId {
        return this.state.get("auth.userId");
    }

    /**
     * Set default pagination queries.
     */
    paginationQuery() {
        return this.$query
            .defaults({
                page: 1,
                perPage: 30
            })
            .pick(["page", "perPage"]) as any;
    }
}

/**
 * Extend xpresser/types/http
 */
declare module "xpresser/types/http" {
    interface Http extends RequestEngine {}
}

/**
 * Export Extended RequestEngine.
 */
export = () => RequestEngine;
