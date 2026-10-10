// The real auth guard loads better-auth, an ESM build the unit project does
// not transform; a stand-in class is enough here.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));

jest.mock("@saroh/database", () => ({
    ...jest.requireActual<object>("@saroh/database"),
    prisma: {
        organization: { findUnique: jest.fn() },
        store: { findFirst: jest.fn() },
        membership: { findFirst: jest.fn() },
        storeOwner: { findFirst: jest.fn() },
        storeMembers: { findFirst: jest.fn() },
    },
}));

import "reflect-metadata";

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { prisma } from "@saroh/database";

import { LIFECYCLE_WRITE_KEY } from "../../common/decorators/lifecycle-write.decorator";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import { StoreLifecycleGuard } from "../../common/guards/store-lifecycle.guard";
import { BookingsController } from "../bookings/bookings.controller";
import {
    BookingClassPackController,
    ClassPacksController,
} from "../class-packs/class-packs.controller";
import {
    CourseEnrollmentsController,
    CoursesController,
} from "../courses/courses.controller";
import { InvoicesController } from "../invoices/invoices.controller";
import { OrdersController } from "../orders/orders.controller";
import { OrganizationOrdersController } from "../orders/organization-orders.controller";
import { PaymentsController } from "../payments/payments.controller";
import {
    SubscriptionPlansController,
    SubscriptionsController,
} from "../subscriptions/subscriptions.controller";
import type { OrganizationContextService } from "./organization-context.service";

/**
 * A business that is closing winds down (owner, 9 Oct, DEC-120): nothing
 * new starts, but what it already started can be finished, cancelled or
 * refunded until its deletion date.
 *
 * Every write route under orders, bookings, refunds and payments,
 * memberships, class packs, courses and invoices is named here as
 * wind-down (let through while `PENDING_DELETION`) or new (refused). A
 * route in neither list fails, so a new one is a decision, not a default —
 * and a route without `@LifecycleWrite` is new.
 *
 * Moving a booking is refused (owner's choice left to us, 9 Oct): it takes
 * a new slot, and a closing business takes no new bookings; cancelling is
 * open. So is booking a treatment's next visit.
 */
const CASES = [
    {
        controller: OrganizationOrdersController,
        windDown: [
            // The kitchen's steps, one order or a batch, and their Undo.
            "createBatch",
            "commitBatch",
            "cancelBatch",
            "undoBatch",
            "moveStage",
            "undoStage",
            "markVisitAttended",
            // Money for an order already made: a pay link (it needs a
            // connected provider anyway), a payment recorded by hand.
            "payLink",
            "recordDifference",
            "changeFulfilment",
            "cancel",
        ],
        refused: ["edit"],
    },
    {
        // `update` marks an order paid or refunded by hand, or moves its
        // status; `create` is New order and the counter's sale.
        controller: OrdersController,
        windDown: ["update"],
        refused: ["create"],
    },
    {
        controller: BookingsController,
        windDown: [
            "recordOutcome",
            "payLink",
            "takeDeskPayment",
            "cancelBooking",
        ],
        refused: [
            "createService",
            "updateService",
            "removeService",
            "replaceRules",
            "addRule",
            "deleteRule",
            "bookByHand",
            "rescheduleBooking",
            "bookVisit",
        ],
    },
    {
        // No route cancels a pack purchase yet; one added would be wind-down.
        controller: ClassPacksController,
        windDown: [],
        refused: [
            "extend",
            "create",
            "createDraft",
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
        // Paying for a booking already made with a class already sold, or
        // giving the class back.
        controller: BookingClassPackController,
        windDown: ["use", "remove"],
        refused: [],
    },
    {
        controller: CoursesController,
        windDown: ["cancelEnrollment"],
        refused: ["create", "update", "addSession", "removeSession", "enrol"],
    },
    { controller: CourseEnrollmentsController, windDown: [], refused: [] },
    {
        controller: SubscriptionPlansController,
        windDown: [],
        refused: [
            "create",
            "createDraft",
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
        // Ending what runs; `keep` (undoing a cancel), pausing and skipping
        // change a membership, and retrying charges is billing, refused in
        // the window anyway (DEC-021).
        controller: SubscriptionsController,
        windDown: ["cancel", "cancelPlanChange", "cancelAutopay"],
        refused: [
            "updateSettings",
            "subscribe",
            "pause",
            "resume",
            "keep",
            "setCollection",
            "skip",
            "unskip",
            "changePlan",
            "retry",
            "autopayLink",
        ],
    },
    {
        // Online refunds need the provider's keys: with them gone the
        // service refuses and the workspace doesn't offer Refund.
        controller: PaymentsController,
        windDown: ["createIntent", "refund", "refundMismatch", "retryRefund"],
        refused: ["connect", "disconnect"],
    },
    {
        controller: InvoicesController,
        windDown: [
            "voidInvoice",
            "credit",
            "payLink",
            "viewLink",
            "send",
            "remind",
            "recordPayment",
        ],
        refused: ["create", "update", "remove", "issue", "reissue"],
    },
] as const;

type Handler = (...args: unknown[]) => unknown;

function handlerOf(controller: { prototype: object }, name: string): Handler {
    return (controller.prototype as Record<string, Handler>)[name];
}

function writeHandlers(controller: { prototype: object }): string[] {
    return Object.getOwnPropertyNames(controller.prototype).filter((name) => {
        if (name === "constructor") return false;
        const method = Reflect.getMetadata(
            METHOD_METADATA,
            handlerOf(controller, name),
        ) as RequestMethod | undefined;
        return method !== undefined && method !== RequestMethod.GET;
    });
}

const findUnique = prisma.organization.findUnique as jest.Mock;
const storeFind = prisma.store.findFirst as jest.Mock;
const membershipFind = prisma.membership.findFirst as jest.Mock;
const ownerFind = prisma.storeOwner.findFirst as jest.Mock;
const memberFind = prisma.storeMembers.findFirst as jest.Mock;

function contextFor(
    controller: object,
    handler: Handler,
    params: Record<string, string> = { organizationId: "org_1" },
): ExecutionContext {
    return {
        getHandler: () => handler,
        getClass: () => controller,
        switchToHttp: () => ({
            getRequest: () => ({
                method: "POST",
                params,
                headers: {},
                user: { id: "user_1" },
            }),
        }),
    } as unknown as ExecutionContext;
}

const guard = new OrganizationGuard(
    {
        resolve: jest.fn(async () => ({
            organizationId: "org_1",
            userId: "user_1",
            role: "OWNER" as const,
        })),
    } as unknown as OrganizationContextService,
    new Reflector(),
);

beforeEach(() => jest.clearAllMocks());

describe("a closing business winds down (DEC-120)", () => {
    describe.each(CASES)(
        "$controller.name",
        ({ controller, windDown, refused }) => {
            it("names every write route as wind-down or refused", () => {
                expect(writeHandlers(controller).sort()).toEqual(
                    [...windDown, ...refused].sort(),
                );
            });

            it("marks exactly the wind-down routes", () => {
                const marked = writeHandlers(controller).filter(
                    (name) =>
                        Reflect.getMetadata(
                            LIFECYCLE_WRITE_KEY,
                            handlerOf(controller, name),
                        ) === "wind-down",
                );
                expect(marked.sort()).toEqual([...windDown].sort());
            });

            const open: readonly string[] = windDown;
            (open.length ? it.each([...open]) : it.skip.each(["(none)"]))(
                "%s goes ahead while the business is closing",
                async (name) => {
                    findUnique.mockResolvedValue({
                        lifecycleStatus: "PENDING_DELETION",
                    });
                    await expect(
                        guard.canActivate(
                            contextFor(controller, handlerOf(controller, name)),
                        ),
                    ).resolves.toBe(true);
                },
            );

            const shut: readonly string[] = refused;
            (shut.length ? it.each([...shut]) : it.skip.each(["(none)"]))(
                "%s is refused while the business is closing",
                async (name) => {
                    findUnique.mockResolvedValue({
                        lifecycleStatus: "PENDING_DELETION",
                    });
                    await expect(
                        guard.canActivate(
                            contextFor(controller, handlerOf(controller, name)),
                        ),
                    ).rejects.toBeInstanceOf(ForbiddenException);
                },
            );
        },
    );

    it("refuses even wind-down while suspended, and nothing while active", async () => {
        const cancel = handlerOf(OrganizationOrdersController, "cancel");
        findUnique.mockResolvedValue({ lifecycleStatus: "SUSPENDED" });
        await expect(
            guard.canActivate(contextFor(OrganizationOrdersController, cancel)),
        ).rejects.toBeInstanceOf(ForbiddenException);
        findUnique.mockResolvedValue({ lifecycleStatus: "ACTIVE" });
        await expect(
            guard.canActivate(
                contextFor(
                    OrganizationOrdersController,
                    handlerOf(OrganizationOrdersController, "edit"),
                ),
            ),
        ).resolves.toBe(true);
    });

    it("tells a member what still works", async () => {
        findUnique.mockResolvedValue({ lifecycleStatus: "PENDING_DELETION" });
        let thrown: unknown;
        try {
            await guard.canActivate(
                contextFor(
                    OrganizationOrdersController,
                    handlerOf(OrganizationOrdersController, "edit"),
                ),
            );
        } catch (error) {
            thrown = error;
        }
        expect((thrown as ForbiddenException).getResponse()).toMatchObject({
            error: "ORGANIZATION_NOT_ACTIVE",
            status: "PENDING_DELETION",
            writeClass: "new",
            message: expect.stringContaining("nothing new can start"),
        });
    });
});

describe("StoreLifecycleGuard (DEC-120)", () => {
    const storeGuard = new StoreLifecycleGuard(new Reflector());
    const create = handlerOf(OrdersController, "create");
    const update = handlerOf(OrdersController, "update");
    const at = { storeId: "store_1" };

    beforeEach(() => {
        storeFind.mockResolvedValue({
            organizationId: "org_1",
        });
        membershipFind.mockResolvedValue({
            id: "m_1",
        });
        ownerFind.mockResolvedValue(null);
        memberFind.mockResolvedValue(null);
        findUnique.mockResolvedValue({ lifecycleStatus: "PENDING_DELETION" });
    });

    it("refuses New order at a closing business's storefront", async () => {
        await expect(
            storeGuard.canActivate(contextFor(OrdersController, create, at)),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("lets a payment or refund by hand on an existing order through", async () => {
        await expect(
            storeGuard.canActivate(contextFor(OrdersController, update, at)),
        ).resolves.toBe(true);
    });

    it("tells a stranger nothing: the service answers them", async () => {
        membershipFind.mockResolvedValue(null);
        await expect(
            storeGuard.canActivate(contextFor(OrdersController, create, at)),
        ).resolves.toBe(true);
        expect(findUnique).not.toHaveBeenCalled();
    });
});

/**
 * The miss this closes (DEV_LEARNINGS, "store-scoped writes never asked the
 * lifecycle"): a controller under `stores/…` runs no `OrganizationGuard`,
 * so it must carry the store guard, or a suspended or closing business
 * takes its writes.
 */
describe("every store-scoped controller asks the lifecycle (DEC-120)", () => {
    const MODULES = join(__dirname, "..");
    const files = readdirSync(MODULES, { recursive: true, encoding: "utf8" })
        .map((f) => f.split("\\").join("/"))
        .filter((f) => f.endsWith(".controller.ts"))
        .map((f) => ({ f, text: readFileSync(join(MODULES, f), "utf8") }))
        .filter(({ text }) =>
            /@Controller\("stores|@(Post|Put|Patch|Delete)\("stores\//.test(
                text,
            ),
        );

    it("finds the store-scoped controllers", () => {
        expect(files.length).toBeGreaterThanOrEqual(8);
    });

    it.each(files.map(({ f, text }) => [f, text] as const))(
        "%s carries StoreLifecycleGuard",
        (_file, text) => {
            expect(text).toMatch(/\b[Ss]toreLifecycleGuard\b/);
        },
    );
});
