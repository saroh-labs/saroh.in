/**
 * The account's Billing profiles (DEC-167 step 2, #1015), through the
 * service `billing-profiles.controller.ts` calls, against a real Postgres
 * and the fake billing provider (no Razorpay call is ever made):
 *
 * - owner only: another owner's profile is a 404 on every route, a
 *   teammate (an Admin of the business) has no profiles and gets a 404,
 *   and a business the caller doesn't own can't be moved;
 * - the businesses each profile pays for, with plan, next charge and a
 *   pending move, read across businesses even from inside one's RLS
 *   context (`outsideOrgContext`);
 * - recent invoices, only this profile's, with the owner's PDF route;
 * - edit (step 1's rules: GSTIN against the state, one email per owner)
 *   and add (a duplicate email refused, and moving a business at once);
 * - move: free now, paid at the renewal, paid to an unlinked profile
 *   refused, and a pending move cancelled;
 * - remove: refused while a business or a move points at it, else done;
 * - Try again queues one sync.
 *
 * Integration project (TEST_DATABASE_URL); run with `TEST_RLS=on` too.
 */
import { createHmac } from "node:crypto";

import { ConflictException, NotFoundException } from "@nestjs/common";
import {
    prisma,
    runInOrgContext,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { giveBusinessDetails } from "../../../test/business-details";
import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditService } from "../audit/audit.service";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { resolveCapabilities } from "../organizations/organization-policy";
import { BILLING_PROFILE_SYNC_TYPE } from "./billing-profile-sync";
import {
    BillingProfilesAccountService,
    MOVE_AUTHORISED,
    NO_MOVE_WAITING,
} from "./billing-profiles-account.service";
import {
    BILLING_EMAIL_TAKEN,
    BillingProfilesService,
} from "./billing-profiles.service";
import { BillingWebhookService } from "./billing-webhook.service";
import {
    BusinessBillingProfileService,
    PROFILE_NOT_LINKED,
} from "./business-billing-profile.service";
import { CheckoutService } from "./checkout.service";
import { PlansService } from "./plans.service";
import type { BillingEventPhase } from "./providers/billing-provider.port";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";

const SECRET = "whsec_fake_platform_secret";
const DAY = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;

let fake: FakeBillingProvider;
let checkout: CheckoutService;
let webhooks: BillingWebhookService;
let account: BillingProfilesAccountService;

beforeEach(async () => {
    fake = new FakeBillingProvider("RAZORPAY", SECRET);
    const factory = new FakeBillingProviderFactory(fake);
    checkout = new CheckoutService(new PlansService(), factory);
    webhooks = new BillingWebhookService(factory);
    account = new BillingProfilesAccountService(
        new BillingProfilesService(),
        new BusinessBillingProfileService(
            new BillingProfilesService(),
            checkout,
            new AuditService(),
        ),
        new OrganizationContextService(),
        factory,
    );
    await prisma.job.deleteMany({});
    await prisma.sarohInvoice.deleteMany({});
    await prisma.billingWebhookEvent.deleteMany({});
    await prisma.billingCheckout.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.pricingProviderPlan.deleteMany({});
    await prisma.pricingCatalogVersion.deleteMany({});
    await prisma.plan.deleteMany({});
    const catalog = fakeCatalog();
    const rows = planRows(catalog, 1);
    const { planIds } = await writeCatalogueVersion(prisma, {
        version: 1,
        catalog,
        goLiveAt: new Date(Date.now() - DAY),
        policy: "keep",
        planRows: rows,
    });
    await prisma.pricingProviderPlan.createMany({
        data: planIds
            .filter((_, i) => rows[i]!.priceCents > 0)
            .map((planId) => ({
                planId,
                provider: "RAZORPAY",
                status: "SYNCED",
                providerPlanId: `plan_${planId}`,
            })),
    });
});

let seq = 0;
const uniq = (label: string) => `${label}${++seq}-${tag}`;

async function person(name = "Asha Verma") {
    return prisma.user.create({
        data: { email: `${uniq("person-")}@example.com`, name },
    });
}

async function profileOf(
    ownerUserId: string,
    over: { legalName?: string; linked?: boolean } = {},
) {
    const made = await prisma.billingProfile.create({
        data: {
            ownerUserId,
            legalName: over.legalName ?? "Pulse Fitness LLP",
            gstin: "29ABCDE1234F1ZW",
            gstState: "29",
            addressLine1: "3 Hill Road",
            city: "Bengaluru",
            postalCode: "560038",
            billingEmail: `${uniq("billing-")}@example.com`,
            provider: "RAZORPAY",
        },
    });
    if (over.linked) {
        return prisma.billingProfile.update({
            where: { id: made.id },
            data: { providerCustomerId: `fake_cus_${made.id}` },
        });
    }
    return made;
}

/** A business on Free, billed to `billingProfileId`, with `userId` in `role`. */
async function business(
    userId: string,
    billingProfileId: string | null,
    role: "OWNER" | "ADMIN" = "OWNER",
    name = "Pulse Fitness Rohtak",
) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("biz-"), billingProfileId },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId, role },
    });
    await startOnFreePlan(prisma, org.id, { planId: "free" });
    await giveBusinessDetails(org.id);
    return org;
}

function ownerCtx(userId: string, organizationId: string): OrganizationContext {
    return {
        organizationId,
        userId,
        role: "OWNER",
        roleKey: "OWNER",
        actions: resolveCapabilities("OWNER", null, []),
    };
}

let evt = 0;
async function deliver(
    providerSubscriptionId: string,
    phase: BillingEventPhase,
    currentPeriodEnd?: Date,
) {
    evt += 1;
    const raw = Buffer.from(
        JSON.stringify({
            providerEventId: `evt_${evt}_${tag}`,
            type: `subscription.${phase}`,
            providerSubscriptionId,
            status: phase === "activated" ? "ACTIVE" : "IGNORED",
            phase,
            eventAt: new Date(Date.now() + evt).toISOString(),
            ...(currentPeriodEnd
                ? { currentPeriodEnd: currentPeriodEnd.toISOString() }
                : {}),
        }),
    );
    const signature = createHmac("sha256", SECRET).update(raw).digest("hex");
    return webhooks.handle("razorpay", raw, { "x-fake-signature": signature });
}

/** Put the business on a paid monthly plan renewing at `renewsAt`. */
async function onPaidPlan(ctx: OrganizationContext, renewsAt: Date) {
    const r = await checkout.changePlan(ctx, { plan: "b", cycle: "month" });
    if (r.kind === "TO_FREE") throw new Error("expected a checkout");
    await deliver(`fake_sub_${r.checkout.id}`, "activated", renewsAt);
}

let invoiceSeq = 0;
async function invoice(
    organizationId: string,
    billingProfileId: string | null,
    issuedAt: Date,
) {
    invoiceSeq += 1;
    return prisma.sarohInvoice.create({
        data: {
            organizationId,
            billingProfileId,
            number: `TST/${tag.slice(-6)}/${invoiceSeq}`,
            series: `TST/${tag}`,
            chargeKey: `spec:${tag}:${invoiceSeq}`,
            source: "RENEWAL",
            provider: "RAZORPAY",
            providerEventId: `evt_inv_${tag}_${invoiceSeq}`,
            planName: "Plan B",
            cycle: "month",
            issuedAt,
            sellerName: "Example Labs",
            billToName: "Pulse Fitness LLP",
            taxType: "INTRA",
            subtotalPaise: 10000,
            taxablePaise: 10000,
            cgstPaise: 900,
            sgstPaise: 900,
            igstPaise: 0,
            taxPaise: 1800,
            totalPaise: 11800,
        },
    });
}

const billedTo = async (id: string) =>
    (await prisma.organization.findUniqueOrThrow({ where: { id } }))
        .billingProfileId;

describe("only the owner", () => {
    it("another owner's profile is a 404 on every route", async () => {
        const asha = await person();
        const ravi = await person("Ravi Kumar");
        const hers = await profileOf(asha.id);
        const his = await profileOf(ravi.id, { legalName: "Ravi Foods" });
        const herShop = await business(asha.id, hers.id);

        expect((await account.list(ravi.id)).map((p) => p.id)).toEqual([
            his.id,
        ]);
        const refusals = [
            () => account.detail(ravi.id, hers.id),
            () => account.update(ravi.id, hers.id, { city: "Pune" }),
            () => account.move(ravi.id, hers.id, herShop.id),
            () => account.cancelPending(ravi.id, hers.id, herShop.id),
            () => account.remove(ravi.id, hers.id),
            () => account.retrySync(ravi.id, hers.id),
        ];
        for (const call of refusals) {
            await expect(call()).rejects.toBeInstanceOf(NotFoundException);
        }
        // His own profile, her business: still not his to move.
        await expect(
            account.move(ravi.id, his.id, herShop.id),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(await billedTo(herShop.id)).toBe(hers.id);
        expect(
            await prisma.billingProfile.findUnique({ where: { id: hers.id } }),
        ).toMatchObject({ city: "Bengaluru" });
    });

    it("a teammate has no profiles, and can't move the business they work at", async () => {
        const asha = await person();
        const teammate = await person("Meena Iyer");
        const hers = await profileOf(asha.id);
        const shop = await business(asha.id, hers.id);
        await prisma.membership.create({
            data: {
                organizationId: shop.id,
                userId: teammate.id,
                role: "ADMIN",
            },
        });
        const theirs = await profileOf(teammate.id, { legalName: "Meena" });

        expect(await account.list(teammate.id)).toEqual([
            expect.objectContaining({ id: theirs.id, payingFor: [] }),
        ]);
        expect(await account.ownedBusinesses(teammate.id)).toEqual([]);
        await expect(
            account.move(teammate.id, theirs.id, shop.id),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            account.detail(teammate.id, hers.id),
        ).rejects.toBeInstanceOf(NotFoundException);

        const nobody = await person("New Person");
        expect(await account.list(nobody.id)).toEqual([]);
    });
});

describe("what each profile pays for", () => {
    it("lists each business with its plan, next charge and a pending move, across businesses", async () => {
        const asha = await person();
        const pulse = await profileOf(asha.id, { linked: true });
        const own = await profileOf(asha.id, {
            legalName: "Asha Verma",
            linked: true,
        });
        const rohtak = await business(asha.id, pulse.id, "OWNER", "Rohtak");
        const gurugram = await business(asha.id, pulse.id, "OWNER", "Gurugram");
        const yoga = await business(asha.id, own.id, "OWNER", "Yoga Corner");
        const renewsAt = new Date(Date.now() + 16 * DAY);
        await onPaidPlan(ownerCtx(asha.id, gurugram.id), renewsAt);
        // Gurugram moves to her own profile at its renewal.
        await account.move(asha.id, own.id, gurugram.id);

        // Read from inside one business's context: the others still show.
        const list = await runInOrgContext(yoga.id, () =>
            account.list(asha.id),
        );
        const byId = new Map(list.map((p) => [p.id, p]));
        const onPulse = byId.get(pulse.id)!;
        expect(onPulse.businesses).toBe(2);
        expect(onPulse.sync).toBe("linked");
        expect(onPulse.payingFor.map((b) => b.name)).toEqual([
            "Gurugram",
            "Rohtak",
        ]);
        expect(onPulse.payingFor[0]).toMatchObject({
            id: gurugram.id,
            owner: true,
            paid: true,
            plan: { cycle: "month" },
            nextChargeAt: renewsAt.toISOString(),
            pendingMove: {
                toProfileId: own.id,
                toLegalName: "Asha Verma",
                at: renewsAt.toISOString(),
                authorised: false,
            },
        });
        expect(onPulse.payingFor[1]).toMatchObject({
            id: rohtak.id,
            paid: false,
            nextChargeAt: null,
            pendingMove: null,
        });
        expect(byId.get(own.id)).toMatchObject({
            payingFor: [expect.objectContaining({ id: yoga.id })],
            movingIn: [
                {
                    organizationId: gurugram.id,
                    name: "Gurugram",
                    at: renewsAt.toISOString(),
                },
            ],
        });

        const owned = await account.ownedBusinesses(asha.id);
        expect(owned.map((b) => [b.name, b.billingProfileId])).toEqual([
            ["Gurugram", pulse.id],
            ["Rohtak", pulse.id],
            ["Yoga Corner", own.id],
        ]);
    });

    it("says where each profile stands at the provider", async () => {
        const asha = await person();
        const linked = await profileOf(asha.id, { linked: true });
        const failed = await profileOf(asha.id, { legalName: "Old Mill" });
        await prisma.billingProfile.update({
            where: { id: failed.id },
            data: { lastError: "refused" },
        });
        const linking = await profileOf(asha.id, { legalName: "Raja Ji" });
        const states = new Map(
            (await account.list(asha.id)).map((p) => [p.id, p.sync]),
        );
        expect(states.get(linked.id)).toBe("linked");
        expect(states.get(failed.id)).toBe("failed");
        expect(states.get(linking.id)).toBe("linking");
    });
});

describe("a profile's page", () => {
    it("shows its recent invoices, only its own, with the owner's PDF route", async () => {
        const asha = await person();
        const pulse = await profileOf(asha.id);
        const other = await profileOf(asha.id, { legalName: "Asha Verma" });
        const shop = await business(asha.id, pulse.id);
        for (let i = 0; i < 7; i += 1) {
            await invoice(
                shop.id,
                pulse.id,
                new Date(Date.UTC(2026, 8, 1 + i)),
            );
        }
        await invoice(shop.id, other.id, new Date(Date.UTC(2026, 9, 1)));

        const page = await account.detail(asha.id, pulse.id);
        expect(page.invoiceCount).toBe(7);
        expect(page.invoices).toHaveLength(5);
        expect(page.invoices[0]).toMatchObject({
            organizationId: shop.id,
            businessName: "Pulse Fitness Rohtak",
            issuedAt: new Date(Date.UTC(2026, 8, 7)).toISOString(),
            totalPaise: 11800,
            pdfPath: `/organizations/${shop.id}/billing/invoices/${page.invoices[0]!.id}/pdf`,
        });
        expect(page.removeBlockedBy).toBe(
            "Move its business to another profile first.",
        );
        const all = await account.detail(asha.id, pulse.id, true);
        expect(all.invoices).toHaveLength(7);
    });

    it("no PDF route for a business the owner no longer owns", async () => {
        const asha = await person();
        const pulse = await profileOf(asha.id);
        const shop = await business(asha.id, pulse.id, "ADMIN");
        await invoice(shop.id, pulse.id, new Date());
        const page = await account.detail(asha.id, pulse.id);
        expect(page.invoices[0]!.pdfPath).toBeNull();
        expect(page.payingFor[0]).toMatchObject({ owner: false });
    });
});

describe("edit and add", () => {
    it("keeps step 1's rules: the GSTIN's state, and one email per owner", async () => {
        const asha = await person();
        const pulse = await profileOf(asha.id);
        const other = await profileOf(asha.id, { legalName: "Asha Verma" });
        await business(asha.id, pulse.id);
        await business(asha.id, pulse.id, "OWNER", "Gurugram");

        await expect(
            account.update(asha.id, pulse.id, {
                gstin: "29ABCDE1234F1ZW",
                gstState: "06",
            }),
        ).rejects.toThrow(/registered in Karnataka, not Haryana/);
        await expect(
            account.update(asha.id, pulse.id, {
                billingEmail: other.billingEmail,
            }),
        ).rejects.toThrow(BILLING_EMAIL_TAKEN);

        const saved = await account.update(asha.id, pulse.id, {
            city: "Mysuru",
        });
        expect(saved.businesses).toBe(2);
        expect(saved.profile).toMatchObject({ city: "Mysuru", businesses: 2 });
        expect(
            await prisma.job.count({
                where: { type: BILLING_PROFILE_SYNC_TYPE },
            }),
        ).toBe(1);
    });

    it("adds a profile, refusing an email the owner uses, and can move a business to it", async () => {
        const asha = await person();
        const pulse = await profileOf(asha.id);
        const yoga = await business(asha.id, pulse.id, "OWNER", "Yoga Corner");

        await expect(
            account.create(asha.id, {
                legalName: "Pulse Faridabad LLP",
                billingEmail: pulse.billingEmail.toUpperCase(),
            }),
        ).rejects.toThrow(BILLING_EMAIL_TAKEN);
        expect(await prisma.billingProfile.count()).toBeGreaterThan(0);

        const made = await account.create(
            asha.id,
            {
                legalName: "Pulse Faridabad LLP",
                billingEmail: "faridabad@example.com",
                gstState: "06",
            },
            yoga.id,
        );
        expect(made).toMatchObject({ moved: "applied", notMoved: null });
        expect(made.profile.legalName).toBe("Pulse Faridabad LLP");
        expect(await billedTo(yoga.id)).toBe(made.profile.id);
    });

    it("never adds a profile for a business the caller doesn't own", async () => {
        const asha = await person();
        const ravi = await person("Ravi Kumar");
        const his = await business(ravi.id, null);
        const before = await prisma.billingProfile.count({
            where: { ownerUserId: asha.id },
        });
        await expect(
            account.create(
                asha.id,
                { legalName: "Asha", billingEmail: "asha-new@example.com" },
                his.id,
            ),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(
            await prisma.billingProfile.count({
                where: { ownerUserId: asha.id },
            }),
        ).toBe(before);
    });
});

describe("moving a business", () => {
    it("moves a free business now", async () => {
        const asha = await person();
        const a = await profileOf(asha.id);
        const b = await profileOf(asha.id, { legalName: "Asha Verma" });
        const yoga = await business(asha.id, a.id, "OWNER", "Yoga Corner");
        const moved = await account.move(asha.id, b.id, yoga.id);
        expect(moved.outcome).toBe("applied");
        expect(await billedTo(yoga.id)).toBe(b.id);
    });

    it("moves a paid business at its renewal, to a linked profile only", async () => {
        const asha = await person();
        const a = await profileOf(asha.id, { linked: true });
        const unlinked = await profileOf(asha.id, { legalName: "Old Mill" });
        const linked = await profileOf(asha.id, {
            legalName: "Raja Ji Dhaba",
            linked: true,
        });
        const shop = await business(asha.id, a.id);
        const renewsAt = new Date(Date.now() + 16 * DAY);
        await onPaidPlan(ownerCtx(asha.id, shop.id), renewsAt);

        const refused = account.move(asha.id, unlinked.id, shop.id);
        await expect(refused).rejects.toBeInstanceOf(ConflictException);
        await expect(
            account.move(asha.id, unlinked.id, shop.id),
        ).rejects.toMatchObject({
            response: { details: { code: PROFILE_NOT_LINKED } },
        });
        expect(
            await prisma.billingCheckout.count({
                where: {
                    organizationId: shop.id,
                    billingProfileId: unlinked.id,
                },
            }),
        ).toBe(0);

        const moved = await account.move(asha.id, linked.id, shop.id);
        expect(moved).toMatchObject({
            outcome: "scheduled",
            authorise: {
                at: renewsAt.toISOString(),
                legalName: "Raja Ji Dhaba",
            },
        });
        // Still billed to its profile until the renewal.
        expect(await billedTo(shop.id)).toBe(a.id);

        // The move points at Raja Ji: it can't be removed while it does.
        await expect(account.remove(asha.id, linked.id)).rejects.toThrow(
            "A business is moving to it. Cancel that move first.",
        );

        // Cancelled from the profile it is billed to now.
        await expect(
            account.cancelPending(asha.id, linked.id, shop.id),
        ).rejects.toBeInstanceOf(NotFoundException);
        const kept = await account.cancelPending(asha.id, a.id, shop.id);
        expect(kept.outcome).toBe("kept");
        expect(kept.pendingSwitch).toBeNull();
        await expect(
            account.cancelPending(asha.id, a.id, shop.id),
        ).rejects.toThrow(NO_MOVE_WAITING);

        // With nothing pointing at it any more, it goes.
        await expect(account.remove(asha.id, linked.id)).resolves.toEqual({
            removed: true,
        });
    });

    it("won't cancel a move already authorised", async () => {
        const asha = await person();
        const a = await profileOf(asha.id, { linked: true });
        const b = await profileOf(asha.id, {
            legalName: "Asha Verma",
            linked: true,
        });
        const shop = await business(asha.id, a.id);
        await onPaidPlan(
            ownerCtx(asha.id, shop.id),
            new Date(Date.now() + 16 * DAY),
        );
        await account.move(asha.id, b.id, shop.id);
        const switchRow = await prisma.billingCheckout.findFirstOrThrow({
            where: { organizationId: shop.id, status: "OPEN" },
        });
        await deliver(switchRow.providerSubscriptionId, "authenticated");
        await expect(
            account.cancelPending(asha.id, a.id, shop.id),
        ).rejects.toThrow(MOVE_AUTHORISED);
    });
});

describe("removing a profile", () => {
    it("is refused while a business uses it, and keeps past invoices when it goes", async () => {
        const asha = await person();
        const a = await profileOf(asha.id);
        const b = await profileOf(asha.id, { legalName: "Old Mill Bakery" });
        const shop = await business(asha.id, a.id);
        await business(asha.id, a.id, "OWNER", "Gurugram");
        const kept = await invoice(shop.id, b.id, new Date());

        await expect(account.remove(asha.id, a.id)).rejects.toThrow(
            "Move its 2 businesses to another profile first.",
        );
        expect(
            (await account.detail(asha.id, b.id)).removeBlockedBy,
        ).toBeNull();
        await expect(account.remove(asha.id, b.id)).resolves.toEqual({
            removed: true,
        });
        expect(
            await prisma.billingProfile.findUnique({ where: { id: b.id } }),
        ).toBeNull();
        expect(
            await prisma.sarohInvoice.findUniqueOrThrow({
                where: { id: kept.id },
            }),
        ).toMatchObject({ billToName: "Pulse Fitness LLP" });
    });
});

describe("Try again", () => {
    it("queues one sync, and says it is linking", async () => {
        const asha = await person();
        const failed = await profileOf(asha.id, { legalName: "Old Mill" });
        await prisma.billingProfile.update({
            where: { id: failed.id },
            data: { lastError: "refused" },
        });
        expect(await account.retrySync(asha.id, failed.id)).toEqual({
            sync: "linking",
            queued: true,
        });
        expect(await account.retrySync(asha.id, failed.id)).toEqual({
            sync: "linking",
            queued: false,
        });
        expect(
            await prisma.job.count({
                where: { type: BILLING_PROFILE_SYNC_TYPE, status: "PENDING" },
            }),
        ).toBe(1);
    });
});
