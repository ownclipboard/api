import { ObjectId } from "xpress-mongo";
import { $ } from "../xpresser";

class RequestEngine extends $.extendedRequestEngine() {
    /**
     * Check if user is logged!
     */
    isLogged() {
        return !!this.authUserId();
    }

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
 * Export Extended RequestEngine.
 */
export = RequestEngine;

/**
 * Extend xpresser/types/http
 */
declare module "xpresser/types/http" {
    interface Http extends RequestEngine {}
}
