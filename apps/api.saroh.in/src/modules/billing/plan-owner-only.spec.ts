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
    // Callable too, for `prisma.$transaction(…)`. The one read the guard
    // makes for a Global business is whether it already pays (stage 9:
    // upkeep stays open to a payer): none here.
    const delegate = new Proxy(reached, {
        get: (_t, key) =>
            key === "count" ? () => Promise.resolve(0) : reached,
    });
    return {
        ...jest.requireActual("@saroh/database"),
        prisma: new Proxy({}, { get: () => delegate }),
    };
});

// Saroh's plans abroad are off (stage 9, DEC-211), as in production.
jest.mock("../feature-flags/feature-flags.service", () => ({
    FeatureFlagService: class {
        isEnabled() {
            return Promise.resolve(false);
        }
    },
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    resolveCapabilities,
    roleDenial,
} from "../organizations/organization-policy";
import { LaunchOfferService } from "../waitlist/launch-offer.service";
import { AddonsService } from "./addons.service";
import { BillingProfilesService } from "./billing-profiles.service";
import type { BillingWebhookService } from "./billing-webhook.service";
import { BusinessBillingProfileService } from "./business-billing-profile.service";
import { CheckoutConfirmService } from "./checkout-confirm.service";
import { CheckoutService } from "./checkout.service";
import { PlansService } from "./plans.service";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";
import { SAROH_BILLS_ONLY_IN_INDIA } from "./saroh-bills";
import { SubscriptionsService } from "./subscriptions.service";

const providers = new FakeBillingProviderFactory(
    new FakeBillingProvider("RAZORPAY"),
);
const user = { id: "user_1", email: "asha@example.com" } as never;
const billingProfile = new BusinessBillingProfileService(
    new BillingProfilesService(),
    new CheckoutService(new PlansService(), providers),
);

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
    // Who Saroh bills for the business (DEC-167, U5).
    "POST profile/choose": (ctx) => billingProfile.choose(ctx, "bprof_1"),
    "POST profile": (ctx) =>
        billingProfile.create(
            ctx,
            { legalName: "Asha Foods", billingEmail: "a@example.com" },
            true,
        ),
    "PATCH profile/:profileId": (ctx) =>
        billingProfile.update(ctx, "bprof_1", { city: "Pune" }),
};

/** Routes of the business's billing profile, by their controller's own path. */
const PROFILE_ROUTES: Record<string, string> = {
    "POST choose": "POST profile/choose",
    POST: "POST profile",
    "PATCH :profileId": "PATCH profile/:profileId",
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

/**
 * Saroh bills only an edition whose profile says so (DEC-204): a Global
 * Owner is refused every plan, charge and billing profile before anything
 * is read, and an India Owner gets past as before.
 */
const checkout = new CheckoutService(new PlansService(), providers);
const SAROH_BILLED: Record<
    string,
    (ctx: OrganizationContext) => Promise<unknown>
> = {
    ...Object.fromEntries(
        Object.entries(WRITES).filter(
            ([route]) =>
                ![
                    "POST cancel",
                    "PATCH profile/:profileId",
                    // A Global invite joins on Free instead (owner, 9 Nov
                    // 2026): invites.service.spec.ts, invites.db.spec.ts.
                    "POST launch-offer",
                ].includes(route),
        ),
    ),
    "GET change-plan": (ctx) =>
        checkout.quote(ctx, { plan: "grow", cycle: "month" }),
    "a one-off charge (message top-up)": (ctx) =>
        checkout.startOneOff(ctx, {
            amountPaise: 11800,
            reference: "ref_1",
            itemKey: "messaging.pack",
        }),
    "a profile switch at the renewal": (ctx) =>
        checkout.startProfileSwitch(ctx, {
            billingProfileId: "bprof_1",
            plan: {} as never,
            startAt: new Date(),
        }),
};

describe.each(Object.keys(SAROH_BILLED))("%s", (route) => {
    const write = SAROH_BILLED[route]!;
    const owner = OWNERS["the Owner, resolved"]!;

    it("refuses a Global business before reading anything", async () => {
        await expect(
            write({ ...owner, edition: "GLOBAL" }),
        ).rejects.toMatchObject({
            status: 409,
            response: { message: SAROH_BILLS_ONLY_IN_INDIA },
        });
    });

    it.each(["INDIA", undefined] as const)(
        "lets an India business (%s) past it",
        async (edition) => {
            const outcome = await write({ ...owner, edition }).then(
                () => null,
                (error: { message?: string }) => error,
            );
            expect(outcome?.message).not.toBe(SAROH_BILLS_ONLY_IN_INDIA);
        },
    );
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

describe("a billing profile is the owner's alone, reads included (AE6)", () => {
    it.each(Object.keys(REFUSED))(
        "refuses %s the profile view before reading anything",
        async (who) => {
            await expect(
                billingProfile.view(REFUSED[who]!),
            ).rejects.toMatchObject({ status: 403, ...refusal });
        },
    );

    it("lets the Owner read it", async () => {
        await expect(billingProfile.view(OWNERS["the Owner"]!)).rejects.toThrow(
            "reached the database",
        );
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

    it("billing.controller.ts and the business's billing profile", () => {
        expect(
            [
                ...routes("billing.controller.ts"),
                ...routes("business-billing-profile.controller.ts").map(
                    (r) => PROFILE_ROUTES[r] ?? r,
                ),
            ].sort(),
        ).toEqual(
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
