/**
 * Saroh bills only a business whose edition's profile says so (DEC-204):
 * a Global business, its context resolved as `OrganizationGuard` resolves
 * it, is refused a billing profile, a plan quote, a change of plan, a
 * checkout confirm, an add-on, a one-off charge and a move from the
 * account's Billing profiles, each a 409 that leaves nothing written. An
 * India business chooses a profile as before.
 *
 * Integration project (TEST_DATABASE_URL).
 */
import { prisma, startOnFreePlan } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditService } from "../audit/audit.service";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { AddonsService } from "./addons.service";
import { BillingProfilesAccountService } from "./billing-profiles-account.service";
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

const providers = new FakeBillingProviderFactory(
    new FakeBillingProvider("RAZORPAY"),
);
const checkout = new CheckoutService(new PlansService(), providers);
const business = new BusinessBillingProfileService(
    new BillingProfilesService(),
    checkout,
    new AuditService(),
);
const contexts = new OrganizationContextService();
const account = new BillingProfilesAccountService(
    new BillingProfilesService(),
    business,
    contexts,
    providers,
);

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

const refused = {
    status: 409,
    response: { message: SAROH_BILLS_ONLY_IN_INDIA },
};

async function ownerOf(edition: "INDIA" | "GLOBAL") {
    const user = await prisma.user.create({
        data: { email: `${uniq("owner-")}@example.com`, name: "Asha Rao" },
    });
    const org = await prisma.organization.create({
        data: {
            name: "Asha's Kitchen",
            slug: uniq("asha-"),
            edition,
            ...(edition === "GLOBAL" ? { currency: "USD" } : {}),
        },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    await startOnFreePlan(prisma, org.id, { planId: "free" });
    const ctx: OrganizationContext = await contexts.resolve(user.id, org.id);
    return { user, org, ctx };
}

async function profileOf(ownerUserId: string) {
    return prisma.billingProfile.create({
        data: {
            ownerUserId,
            legalName: "Asha Foods LLP",
            addressLine1: "3 Hill Road",
            city: "Bengaluru",
            postalCode: "560038",
            billingEmail: `${uniq("accounts-")}@example.com`,
            provider: "RAZORPAY",
        },
    });
}

describe("a Global business is refused Saroh's plans", () => {
    it("has its edition on the context the guard resolves", async () => {
        const { ctx } = await ownerOf("GLOBAL");
        expect(ctx.edition).toBe("GLOBAL");
    });

    it("refuses every plan, charge and billing profile, writing nothing", async () => {
        const { user, org, ctx } = await ownerOf("GLOBAL");
        const mine = await profileOf(user.id);
        const before = await prisma.billingProfile.count({
            where: { ownerUserId: user.id },
        });
        const input = {
            legalName: "Asha Foods",
            billingEmail: "a@example.com",
        };

        const attempts: Array<() => Promise<unknown>> = [
            () => business.create(ctx, input, true),
            () => business.create(ctx, input, false),
            () => business.choose(ctx, mine.id),
            () => checkout.quote(ctx, { plan: "grow", cycle: "month" }),
            () => checkout.changePlan(ctx, { plan: "grow", cycle: "month" }),
            () =>
                new CheckoutConfirmService(
                    providers,
                    {} as BillingWebhookService,
                ).confirm(ctx),
            () => new AddonsService().set(ctx, "addon_1", 1),
            () =>
                checkout.startOneOff(ctx, {
                    amountPaise: 11800,
                    reference: uniq("ref-"),
                    itemKey: "messaging.pack",
                }),
            () => account.create(user.id, input, org.id),
            () => account.move(user.id, mine.id, org.id),
        ];
        for (const attempt of attempts) {
            await expect(attempt()).rejects.toMatchObject(refused);
        }

        const after = await prisma.organization.findUniqueOrThrow({
            where: { id: org.id },
            select: { billingProfileId: true },
        });
        expect(after.billingProfileId).toBeNull();
        expect(
            await prisma.billingProfile.count({
                where: { ownerUserId: user.id },
            }),
        ).toBe(before);
        expect(
            await prisma.billingCheckout.count({
                where: { organizationId: org.id },
            }),
        ).toBe(0);
    });
});

describe("an India business is unchanged", () => {
    it("chooses one of its owner's profiles at once on Free", async () => {
        const { user, org, ctx } = await ownerOf("INDIA");
        const mine = await profileOf(user.id);
        await expect(business.choose(ctx, mine.id)).resolves.toMatchObject({
            outcome: "applied",
        });
        const after = await prisma.organization.findUniqueOrThrow({
            where: { id: org.id },
            select: { billingProfileId: true },
        });
        expect(after.billingProfileId).toBe(mine.id);
    });
});
