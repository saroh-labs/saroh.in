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
import { CustomersController } from "../customers/customers.controller";
import { OrdersController } from "../orders/orders.controller";
import { OrganizationOrdersController } from "../orders/organization-orders.controller";
import type { OrganizationContextService } from "../organizations/organization-context.service";
import type { ModuleAvailabilityService } from "./module-availability.service";
import { ModuleEnforcementGuard } from "./module-enforcement.guard";

/**
 * A module switched off hides its screens; the history it held stays
 * readable (#117, DEC-057, `MODULE_ROLLOUT.md`). These controllers were gated
 * whole, so with enforcement on and Commerce off, Sell → Orders answered
 * 403 for orders the business had already taken.
 *
 * Each controller's handlers are split in two: the history reads, which the
 * guard lets through with the module off, and everything else — taking,
 * changing, moving, charging, cancelling — which it refuses. Every handler
 * must be in one list, so a new route is a decision, not a default.
 */
const CASES = [
    {
        controller: OrganizationOrdersController,
        moduleKey: "COMMERCE",
        reads: ["list", "filters", "products", "read"],
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
            "cancel",
            "edit",
        ],
    },
    {
        controller: OrdersController,
        moduleKey: "COMMERCE",
        reads: ["list", "get"],
        gated: ["create", "newOrderLines", "update"],
    },
    {
        controller: CustomersController,
        moduleKey: "COMMERCE",
        reads: ["list", "get"],
        gated: ["create", "remove", "update"],
    },
    {
        controller: BookingsController,
        moduleKey: "APPOINTMENTS",
        reads: ["calendarBookings", "listServiceBookings", "getBooking"],
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
            "cancelBooking",
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

describe("history reads survive a module switched off (#117)", () => {
    beforeEach(() => {
        process.env.MODULE_ENFORCEMENT = "1";
    });
    afterEach(() => {
        delete process.env.MODULE_ENFORCEMENT;
    });

    describe.each(CASES)(
        "$controller.name",
        ({ controller, moduleKey, reads, gated }) => {
            it("names every handler as a history read or a gated route", () => {
                const handlers = Object.getOwnPropertyNames(
                    controller.prototype,
                ).filter((n) => n !== "constructor");
                expect([...handlers].sort()).toEqual(
                    [...reads, ...gated].sort(),
                );
            });

            it.each([...reads])(
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

            it.each([...gated])(
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
