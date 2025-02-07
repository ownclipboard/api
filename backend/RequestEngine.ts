import { ObjectId } from "xpress-mongo";
import { $ } from "../xpresser";
import type { ValidationError } from "abolish/src/types";

class RequestEngine extends $.extendedRequestEngine() {

    authData() {
        return this.state.get<{
            id: ObjectId;
            username: string;
            publicId: string;
        }>("authData")!;
    }

    /**
     * Check if user is logged!
     */
    isLogged() {
        return !!this.authData();
    }

    /**
     * Get current authenticated userId
     */
    authUserId(): ObjectId {
        return this.authData()!.id;
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
            .pick(["page", "perPage"]) as { page: number; perPage: number };
    }

    /**
     * Send bad request response.
     * @param error
     */
    badRequestError(error: string) {
        return this.error(error, 400);
    }

    /**
     * Send Error Helper.
     * @param message
     * @param status
     */
    error(message: string, status: number = 500, data?: Record<string, any>) {
        return this.status(status).json({
            error: message,
            ...(data || {})
        });
    }

    /**
     * Abolish Error
     */
    abolishError(error: ValidationError) {
        return this.error(error.message, 400, {
            field: error.key
        });

    }
}

/**
 * Export Extended CustomRequestEngine.
 */
export = RequestEngine;

/**
 * Extend xpresser/types/http
 */
declare module "xpresser/types/http" {
    interface Http extends RequestEngine {}
}
