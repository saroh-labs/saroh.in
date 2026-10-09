// The real guards load better-auth, an ESM build the unit project does not
// transform; stand-in classes are enough here.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class OrganizationGuard {},
}));
// The refusal's log line has its own spec.
jest.mock("./module-enforcement.log", () => ({
    logModuleEnforcement: jest.fn(),
}));

import "reflect-metadata";

import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { BookingsController } from "../bookings/bookings.controller";
import {
    BookingClassPackController,
    ClassPacksController,
} from "../class-packs/class-packs.controller";
import {
    CourseEnrollmentsController,
    CoursesController,
} from "../courses/courses.controller";
import { CustomersController } from "../customers/customers.controller";
import { OrdersController } from "../orders/orders.controller";
import { OrganizationOrdersController } from "../orders/organization-orders.controller";
import type { OrganizationContextService } from "../organizations/organization-context.service";
import {
    SubscriptionPlansController,
    SubscriptionsController,
} from "../subscriptions/subscriptions.controller";
import type { ModuleAvailabilityService } from "./module-availability.service";
import { ModuleEnforcementGuard } from "./module-enforcement.guard";

/**
 * A module switched off hides its screens; the history it held stays
 * readable (#117, DEC-057, `MODULE_ROLLOUT.md`). These controllers were gated
 * whole, so with enforcement on and Commerce off, Sell → Orders answered
 * 403 for orders the business had already taken.
 *
 * Each controller's handlers are split in three: the history reads, which the
 * guard lets through with the module off; the wind-down actions, let through
 * too; and everything else — taking, changing, moving, charging — which it
 * refuses. Every handler must be in one list, so a new route is a decision,
 * not a default.
 *
 * Wind-down (owner, 9 Oct, #117; DEC-057): switching a module off must not
 * trap a business with commitments it can no longer undo. Cancelling an
 * order, a booking, a subscription or a course enrolment already made — and
 * the refund that cancel makes — still works with the module off. Role
 * permissions still apply in the service; only the module gate is lifted.
 * Anything that starts or changes a commitment stays gated.
 */
const CASES = [
    {
        controller: OrganizationOrdersController,
        moduleKey: "COMMERCE",
        reads: ["list", "filters", "products", "read"],
        windDown: ["cancel"],
        gated: [
            "createBatch",
            "readBatch",
            "commitBatch",
            "cancelBatch",
            "undoBatch",
            "moveStage",
            "markVisitAttended",
            "undoStage",
            "payLink",
            "recordDifference",
            "changeFulfilment",
            "edit",
        ],
    },
    {
        controller: OrdersController,
        moduleKey: "COMMERCE",
        reads: ["list", "get"],
        windDown: [],
        gated: ["create", "newOrderLines", "update"],
    },
    {
        controller: CustomersController,
        moduleKey: "COMMERCE",
        reads: ["list", "get"],
        windDown: [],
        gated: ["create", "remove", "update"],
    },
    {
        controller: BookingsController,
        moduleKey: "APPOINTMENTS",
        reads: ["calendarBookings", "listServiceBookings", "getBooking"],
        windDown: ["cancelBooking"],
        gated: [
            "createService",
            "listServices",
            "getService",
            "updateService",
            "removeService",
            "listRules",
            "replaceRules",
            "addRule",
            "deleteRule",
            "availability",
            "bookByHand",
            "rescheduleBooking",
            "recordOutcome",
            "payLink",
            "takeDeskPayment",
            "bookVisit",
        ],
    },
    {
        controller: ClassPacksController,
        moduleKey: "CLASS_PACKS",
        reads: [
            "list",
            "purchases",
            "purchase",
            "get",
            "holders",
            "used",
            "sales",
            "events",
        ],
        // No route cancels a pack purchase yet; a new one belongs here.
        windDown: [],
        gated: [
            "selling",
            "extend",
            "create",
            "createDraft",
            "getDraft",
            "saveDraft",
            "publish",
            "discard",
            "remove",
            "update",
            "archive",
            "restore",
            "sell",
        ],
    },
    {
        // Using a pack on a booking, or taking it off, spends or returns a
        // class: a change, not history. Cancelling the booking (above) still
        // gives the class back with Class packs off.
        controller: BookingClassPackController,
        moduleKey: "CLASS_PACKS",
        reads: [],
        windDown: [],
        gated: ["use", "remove"],
    },
    {
        controller: CoursesController,
        moduleKey: "COURSES",
        reads: ["list", "get"],
        windDown: ["cancelEnrollment"],
        gated: ["create", "update", "addSession", "removeSession", "enrol"],
    },
    {
        controller: CourseEnrollmentsController,
        moduleKey: "COURSES",
        reads: ["list"],
        windDown: [],
        gated: [],
    },
    {
        controller: SubscriptionPlansController,
        moduleKey: "PAYMENTS",
        reads: ["list", "get", "events"],
        windDown: [],
        gated: [
            "create",
            "createDraft",
            "getDraft",
            "saveDraft",
            "publish",
            "discard",
            "remove",
            "setChargeTiming",
            "update",
            "archive",
            "restore",
        ],
    },
    {
        controller: SubscriptionsController,
        moduleKey: "PAYMENTS",
        reads: ["list", "get", "events"],
        // Ending a membership already running; `keep` (undoing a cancel)
        // re-commits, so it stays gated.
        windDown: ["cancel"],
        gated: [
            "renewals",
            "settings",
            "updateSettings",
            "autopayOffer",
            "subscribe",
            "pause",
            "resume",
            "keep",
            "setCollection",
            "skip",
            "unskip",
            "changePlan",
            "cancelPlanChange",
            "retry",
            "autopayLink",
            "cancelAutopay",
        ],
    },
] as const;

function handlerOf(controller: { prototype: object }, name: string) {
    return (controller.prototype as Record<string, unknown>)[name] as (
        ...args: unknown[]
    ) => unknown;
}

function guardWithModuleOff() {
    const evaluate = jest.fn().mockResolvedValue({
        blockers: [{ code: "ORG_MODULE_DISABLED" }],
        gatesPassed: false,
    });
    const guard = new ModuleEnforcementGuard(
        new Reflector(),
        { evaluate } as unknown as ModuleAvailabilityService,
        {} as OrganizationContextService,
    );
    return { guard, evaluate };
}

function contextFor(controller: object, handler: unknown): ExecutionContext {
    return {
        getHandler: () => handler,
        getClass: () => controller,
        switchToHttp: () => ({
            getRequest: () => ({
                organizationContext: {
                    organizationId: "org_1",
                    userId: "u_1",
                    role: "OWNER",
                },
            }),
        }),
    } as unknown as ExecutionContext;
}

describe("history reads and wind-down survive a module switched off (#117)", () => {
    beforeEach(() => {
        process.env.MODULE_ENFORCEMENT = "1";
    });
    afterEach(() => {
        delete process.env.MODULE_ENFORCEMENT;
    });

    describe.each(CASES)(
        "$controller.name",
        ({ controller, moduleKey, reads, windDown, gated }) => {
            it("names every handler as a history read, wind-down or gated", () => {
                const handlers = Object.getOwnPropertyNames(
                    controller.prototype,
                ).filter((n) => n !== "constructor");
                expect([...handlers].sort()).toEqual(
                    [...reads, ...windDown, ...gated].sort(),
                );
            });

            // `it.each` refuses an empty table; a controller with nothing
            // let through (or nothing gated) has a placeholder row skipped.
            const open: readonly string[] = [...reads, ...windDown];
            (open.length ? it.each([...open]) : it.skip.each(["(none)"]))(
                "%s is let through with the module off",
                async (name) => {
                    const { guard, evaluate } = guardWithModuleOff();
                    await expect(
                        guard.canActivate(
                            contextFor(controller, handlerOf(controller, name)),
                        ),
                    ).resolves.toBe(true);
                    // Not even asked: the route carries no module.
                    expect(evaluate).not.toHaveBeenCalled();
                },
            );

            const shut: readonly string[] = gated;
            (shut.length ? it.each([...shut]) : it.skip.each(["(none)"]))(
                `%s is refused 403 with ${moduleKey} off`,
                async (name) => {
                    const { guard, evaluate } = guardWithModuleOff();
                    await expect(
                        guard.canActivate(
                            contextFor(controller, handlerOf(controller, name)),
                        ),
                    ).rejects.toThrow(ForbiddenException);
                    expect(evaluate).toHaveBeenCalledWith(
                        expect.objectContaining({ moduleKey }),
                    );
                },
            );
        },
    );
});
