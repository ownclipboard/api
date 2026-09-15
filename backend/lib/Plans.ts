import type { SubscriptionDataType } from "../models/Subscription";

type PaidType = Exclude<SubscriptionDataType["type"], "trial">;

/**
 * Plan pricing in USD.
 * `monthly` is the price for 1 month, `yearly` the price for 1 year.
 */
export const Plans: Record<SubscriptionDataType["plan"], Record<PaidType, number>> = {
    pro: {
        monthly: 2,
        yearly: 20
    }
};

/**
 * Get the total price of a subscription.
 * @param plan - plan name
 * @param type - monthly | yearly
 * @param duration - number of months/years
 */
export function planPrice(plan: SubscriptionDataType["plan"], type: PaidType, duration: number) {
    return Plans[plan][type] * duration;
}
