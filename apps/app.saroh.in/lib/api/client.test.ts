import { describe, expectTypeOf, it } from "vitest";

import type {
    SharedBooking,
    SharedCustomer,
    SharedHoursWindow,
    SharedProduct,
    SharedService,
    SharedStock,
    SharedVariant,
} from "./client";

/**
 * The fields the workspace takes from `@saroh/api-contract` (U15), pinned.
 * These are checked by `tsc` (the app's typecheck), not at run time: a field
 * removed from, renamed in or retyped in the contract fails the typecheck
 * here, before any screen that reads it does.
 */
describe("the workspace's shapes from the contract", () => {
    it("keeps every field the workspace reads", () => {
        expectTypeOf<SharedCustomer>().toEqualTypeOf<{
            id: string;
            email: string;
            firstName: string | null;
            lastName: string | null;
            phone: string | null;
        }>();
        expectTypeOf<SharedProduct>().toEqualTypeOf<{
            id: string;
            name: string;
            slug: string;
            description: string | null;
        }>();
        expectTypeOf<SharedVariant>().toEqualTypeOf<{
            id: string;
            sku: string;
            title: string;
        }>();
        expectTypeOf<SharedStock>().toEqualTypeOf<{
            quantity: number;
            reserved: number;
            lowStockAlert: number;
        }>();
        expectTypeOf<SharedHoursWindow>().toEqualTypeOf<{
            dayOfWeek: number;
            startMinute: number;
            endMinute: number;
        }>();
        expectTypeOf<SharedService>().toEqualTypeOf<{
            id: string;
            name: string;
            description: string | null;
            durationMinutes: number;
            bufferBeforeMinutes: number;
            bufferAfterMinutes: number;
            capacity: number;
            timezone: string;
            createdAt: string;
            updatedAt: string;
        }>();
        expectTypeOf<SharedBooking>().toEqualTypeOf<{
            id: string;
            serviceId: string;
            startAt: string;
            endAt: string;
            timezone: string;
            createdAt: string;
            cancelledAt: string | null;
        }>();
    });

    it("fails the typecheck when the contract loses an output field", () => {
        // What `SharedCustomer` would be with `phone` gone from `customerView`.
        type Losing = Omit<SharedCustomer, "phone">;
        // @ts-expect-error -- a contract without `phone` no longer matches.
        expectTypeOf<Losing>().toEqualTypeOf<SharedCustomer>();
    });
});
