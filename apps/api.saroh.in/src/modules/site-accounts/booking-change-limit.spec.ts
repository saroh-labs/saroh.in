import { HttpException, HttpStatus } from "@nestjs/common";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { takeBookingChange } from "./booking-change-limit";
import type { CustomerContext } from "./customer-context.decorator";

const customer = {
    organizationId: "org_1",
    accountId: "acc_1",
} as CustomerContext;

describe("takeBookingChange (02-limits L3)", () => {
    function limiters(perBooking: number, perAccount: number) {
        return {
            perBooking: new FixedWindowRateLimiter(perBooking, 60_000),
            perAccount: new FixedWindowRateLimiter(perAccount, 60_000),
        };
    }

    it("refuses a booking's changes past its own limit with a 429", async () => {
        const l = limiters(2, 20);
        await takeBookingChange(customer, "BK-1", l);
        await takeBookingChange(customer, "BK-1", l);
        const error = await takeBookingChange(customer, "BK-1", l).catch(
            (e: unknown) => e,
        );
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
            HttpStatus.TOO_MANY_REQUESTS,
        );
        // Another booking still has room.
        await expect(
            takeBookingChange(customer, "BK-2", l),
        ).resolves.toBeUndefined();
    });

    it("caps the account across bookings", async () => {
        const l = limiters(5, 2);
        await takeBookingChange(customer, "BK-1", l);
        await takeBookingChange(customer, "BK-2", l);
        await expect(takeBookingChange(customer, "BK-3", l)).rejects.toThrow(
            HttpException,
        );
        // Another customer is untouched.
        await expect(
            takeBookingChange({ ...customer, accountId: "acc_2" }, "BK-3", l),
        ).resolves.toBeUndefined();
    });
});
