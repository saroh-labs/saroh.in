/**
 * Only the Owner changes what the business pays Saroh (DEC-131, amended
 * 2026-10-11), without a database: every write under
 * `organizations/:id/billing` and the launch offer asks `billing:manage`
 * before it reads anything, and nobody but the built-in Owner holds it.
 * Not an Admin, not a role the business made up that somehow lists it, not
 * a person given it as an extra. Reads stay with `billing:read`.
 *
 * The database here refuses every call, so a refusal by role is proof the
 * guard read nothing first, and "reached the database" that a caller got
 * past it.
 */
jest.mock("@saroh/database", () => {
    const reached = () => {
        throw new Error("reached the database");
    };
    // Callable too, for `prisma.$transaction(…)`.
    const delegate = new Proxy(reached, { get: () => reached });
    return {
        ...jest.requireActual("@saroh/database"),
        prisma: new Proxy({}, { get: () => delegate }),
    };
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    resolveCapabilities,
    roleDenial,
} from "../organizations/organization-policy";
import { LaunchOfferService } from "../waitlist/launch-offer.service";
import { AddonsService } from "./addons.service";
import type { BillingWebhookService } from "./billing-webhook.service";
import { CheckoutConfirmService } from "./checkout-confirm.service";
import { CheckoutService } from "./checkout.service";
import { PlansService } from "./plans.service";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";
import { SubscriptionsService } from "./subscriptions.service";

const providers = new FakeBillingProviderFactory(
    new FakeBillingProvider("RAZORPAY"),
);
const user = { id: "user_1", email: "asha@example.com" } as never;

/** Each write that changes what the business pays, by its route. */
const WRITES: Record<string, (ctx: OrganizationContext) => Promise<unknown>> = {
    "POST change-plan": (ctx) =>
        new CheckoutService(new PlansService(), providers).changePlan(ctx, {
            plan: "grow",
            cycle: "month",
            coupon: "WELCOME",
        }),
    "PUT addons/:addonId": (ctx) => new AddonsService().set(ctx, "addon_1", 1),
    "POST checkout/confirm": (ctx) =>
        new CheckoutConfirmService(
            providers,
            {} as BillingWebhookService,
        ).confirm(ctx),
    // Retired (410), still the owner's alone to be told so.
    "POST subscribe": (ctx) => new SubscriptionsService().subscribe(ctx),
    "POST cancel": (ctx) => new SubscriptionsService().cancel(ctx),
    "POST launch-offer": (ctx) =>
        new LaunchOfferService().redeem(ctx, user, "token"),
};

function member(over: Partial<OrganizationContext>): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "MEMBER",
        ...over,
    };
}

/** Who must be refused, as `OrganizationContextService` would resolve them. */
const REFUSED: Record<string, OrganizationContext> = {
    "an Admin": member({ role: "ADMIN" }),
    "an Admin, resolved": member({
        role: "ADMIN",
        roleKey: "ADMIN",
        actions: resolveCapabilities("ADMIN", null, []),
    }),
    "an Admin given it as an extra": member({
        role: "ADMIN",
        roleKey: "ADMIN",
        actions: resolveCapabilities("ADMIN", null, ["billing:manage"]),
    }),
    "an Admin whose stored row lists it": member({
        role: "ADMIN",
        roleKey: "ADMIN",
        actions: resolveCapabilities("ADMIN", [
            "billing:read",
            "billing:manage",
        ]),
    }),
    "a made-up role that lists it": member({
        roleKey: "finance",
        actions: resolveCapabilities("finance", [
            "billing:read",
            "billing:manage",
        ]),
    }),
    "a made-up role with it as an extra": member({
        roleKey: "finance",
        actions: resolveCapabilities(
            "finance",
            ["billing:read"],
            ["billing:manage"],
        ),
    }),
    "a Member": member({}),
    "a Reviewer": member({ role: "REVIEWER" }),
};

const OWNERS: Record<string, OrganizationContext> = {
    "the Owner": member({ role: "OWNER" }),
    "the Owner, resolved": member({
        role: "OWNER",
        roleKey: "OWNER",
        actions: resolveCapabilities("OWNER", null, []),
    }),
};

const refusal = { response: roleDenial("billing:manage") };

describe.each(Object.keys(WRITES))("%s", (route) => {
    const write = WRITES[route]!;

    it.each(Object.keys(REFUSED))(
        "refuses %s before reading anything",
        async (who) => {
            await expect(write(REFUSED[who]!)).rejects.toMatchObject({
                status: 403,
                ...refusal,
            });
        },
    );

    it.each(Object.keys(OWNERS))("lets %s past the guard", async (who) => {
        // Past the guard it meets the database, or its own next check (an
        // invite link that isn't one): never a refusal by role.
        const outcome = await write(OWNERS[who]!).then(
            () => null,
            (error: { status?: number; message?: string }) => error,
        );
        expect(outcome).not.toBeNull();
        expect(outcome?.status).not.toBe(403);
        expect(outcome?.message).not.toMatch(/^Only the owner can /);
    });
});

describe("the refusal", () => {
    it("is the sentence the app shows as a calm notice, with the permission in details", () => {
        expect(refusal.response).toEqual({
            message: "Only the owner can change the plan.",
            details: { code: "ROLE_DENIED", action: "billing:manage" },
        });
    });
});

describe("reading Plan and billing is unchanged", () => {
    it("an Admin still holds billing:read, with or without a stored row", () => {
        expect(resolveCapabilities("ADMIN").has("billing:read")).toBe(true);
        expect(
            resolveCapabilities("ADMIN", [
                "billing:read",
                "billing:manage",
            ]).has("billing:read"),
        ).toBe(true);
    });

    it("an Admin gets past the read guards", async () => {
        const admin = REFUSED["an Admin, resolved"]!;
        const reads = [
            () => new SubscriptionsService().getCurrent(admin),
            () => new AddonsService().list(admin),
            () =>
                new CheckoutService(new PlansService(), providers).current(
                    admin,
                ),
        ];
        for (const read of reads) {
            await expect(read()).rejects.toThrow("reached the database");
        }
    });
});

describe("every write route is on the list above", () => {
    // A new write under `…/billing` fails here until it is named in WRITES,
    // which is where its guard is proven.
    const routes = (file: string) =>
        [
            ...readFileSync(join(__dirname, file), "utf8").matchAll(
                /@(Post|Put|Patch|Delete)\(\s*(?:"([^"]*)")?\s*\)/g,
            ),
        ].map(([, verb, path]) =>
            `${verb!.toUpperCase()} ${path ?? ""}`.trim(),
        );

    it("billing.controller.ts", () => {
        expect(routes("billing.controller.ts").sort()).toEqual(
            Object.keys(WRITES)
                .filter((r) => r !== "POST launch-offer")
                .sort(),
        );
    });

    it("launch-offer.controller.ts: the check asks no business, the offer does", () => {
        expect(routes("../waitlist/launch-offer.controller.ts")).toEqual([
            "POST check",
            "POST",
        ]);
    });
});
