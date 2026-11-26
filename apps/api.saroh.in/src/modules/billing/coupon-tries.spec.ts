import { HttpException } from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    CheckoutService,
    COUPON_TRIES_PER_ORG,
    COUPON_TRIES_PER_PERSON,
} from "./checkout.service";

/**
 * Coupon tries count per business and per signed-in person, never per
 * address: the workspace's server calls share addresses, so one merchant's
 * tries must not stop another's.
 */
describe("coupon tries", () => {
    // Unique per run, should a Redis be set where the specs run.
    const run = `${Date.now()}`;
    const ctx = (userId: string, organizationId: string) =>
        ({
            userId: `${userId}_${run}`,
            organizationId: `${organizationId}_${run}`,
        }) as OrganizationContext;
    const tryIn = async (service: CheckoutService, c: OrganizationContext) => {
        try {
            await (
                service as unknown as {
                    limitCouponTries: (
                        c: OrganizationContext,
                        code: string,
                        now: Date,
                    ) => Promise<void>;
                }
            ).limitCouponTries(c, "GUESS", new Date());
            return "ok";
        } catch (error) {
            return (error as HttpException).getStatus();
        }
    };
    const fresh = () => new CheckoutService({} as never, {} as never);

    it("one person's tries never stop another person's", async () => {
        const service = fresh();
        for (let i = 0; i < COUPON_TRIES_PER_ORG; i++) {
            await tryIn(service, ctx("user_a", "org_a"));
        }
        expect(await tryIn(service, ctx("user_a", "org_a"))).toBe(429);
        expect(await tryIn(service, ctx("user_b", "org_b"))).toBe("ok");
    });

    it("one person across their businesses is counted once", async () => {
        const service = fresh();
        const answers: (number | string)[] = [];
        for (let i = 0; i <= COUPON_TRIES_PER_PERSON; i++) {
            answers.push(await tryIn(service, ctx("user_c", `org_c${i}`)));
        }
        expect(answers.at(-1)).toBe(429);
        expect(answers.slice(0, COUPON_TRIES_PER_PERSON)).not.toContain(429);
    });
});
