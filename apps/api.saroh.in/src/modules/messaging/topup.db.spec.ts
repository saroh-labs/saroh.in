/**
 * Buying a messaging money pack (#1241, DEC-191) against a real database,
 * through the fake billing provider: the pack is the live catalogue's, the
 * order is Saroh's own, and only a paid billing event credits the wallet —
 * once — with Saroh's invoice. Pack sizes here are made up.
 */
import { createHmac } from "node:crypto";

import { prisma, writeCatalogueVersion } from "@saroh/database";
import { planRows, withGstPaise } from "@saroh/pricing-catalog";

import { giveBillingDetails } from "../../../test/business-details";
import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { BillingWebhookService } from "../billing/billing-webhook.service";
import { CheckoutService } from "../billing/checkout.service";
import { PlansService } from "../billing/plans.service";
import type { BillingEventPhase } from "../billing/providers/billing-provider.port";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "../billing/providers/fake.provider";
import { SarohInvoicesService } from "../billing/saroh-invoices.service";
import type { SarohSeller } from "../billing/saroh-seller";
import { CatalogueService } from "../pricing/catalogue.service";
import { ImpactService } from "../pricing/impact.service";
import { TopupService } from "./topup.service";
import { WalletService } from "./wallet.service";

const SECRET = "whsec_fake_platform_secret";
const PACK = 1234;
const SELLER: SarohSeller = {
    name: "Saroh",
    legalName: "Example Labs Pvt Ltd",
    gstin: "29AAAAA0000A1Z5",
    state: "29",
    address: "1 Test Road, Testville",
    email: "billing@example.test",
    sac: "999999",
    prefix: "TST",
};

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

let fake: FakeBillingProvider;
let webhooks: BillingWebhookService;
let topups: TopupService;
const wallet = new WalletService();

beforeAll(async () => {
    const catalog = fakeCatalog((c) => {
        c.messagePacks = [{ id: "pack-a", amountPaise: PACK }];
    });
    await writeCatalogueVersion(prisma, {
        version: 1,
        catalog,
        goLiveAt: new Date(Date.now() - 1000),
        policy: "keep",
        planRows: planRows(catalog, 1),
    });
});

beforeEach(() => {
    fake = new FakeBillingProvider("RAZORPAY", SECRET);
    const factory = new FakeBillingProviderFactory(fake);
    webhooks = new BillingWebhookService(
        factory,
        undefined,
        new SarohInvoicesService(SELLER),
    );
    topups = new TopupService(
        new CatalogueService(new ImpactService()),
        new CheckoutService(new PlansService(), factory),
        webhooks,
        factory,
    );
});

afterAll(async () => {
    await prisma.$disconnect();
});

async function owner(): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("topup") },
    });
    await giveBillingDetails(org.id);
    return { organizationId: org.id, userId: "owner-user", role: "OWNER" };
}

let evt = 0;
function deliver(
    providerOrderId: string,
    phase: BillingEventPhase,
    id?: string,
) {
    evt += 1;
    const raw = Buffer.from(
        JSON.stringify({
            providerEventId: id ?? `evt_${evt}_${process.pid}`,
            type: phase === "charged" ? "order.paid" : `order.${phase}`,
            providerSubscriptionId: providerOrderId,
            status: phase === "charged" ? "ACTIVE" : "CANCELLED",
            phase,
            eventAt: new Date().toISOString(),
        }),
    );
    const signature = createHmac("sha256", SECRET).update(raw).digest("hex");
    return webhooks.handle("razorpay", raw, { "x-fake-signature": signature });
}

const orderOf = (topupId: string) =>
    prisma.messagingTopup
        .findUniqueOrThrow({ where: { id: topupId } })
        .then((t) => t.providerOrderId);

describe("messaging top-ups", () => {
    it("lists the live catalogue's packs with GST", async () => {
        await expect(topups.packs()).resolves.toEqual([
            {
                id: "pack-a",
                amountPaise: PACK,
                totalPaise: withGstPaise(PACK),
            },
        ]);
    });

    it("a paid order credits the wallet once, resets validity and invoices it", async () => {
        const ctx = await owner();
        const { topup } = await topups.start(ctx, "pack-a");
        expect(topup).toMatchObject({ status: "PENDING", amountPaise: PACK });
        expect(fake.orders.created[0]).toMatchObject({
            amountPaise: withGstPaise(PACK),
            reference: topup.id,
            organizationId: ctx.organizationId,
        });
        const order = await orderOf(topup.id);
        await expect(
            deliver(order, "charged", `evt_paid_${order}`),
        ).resolves.toMatchObject({ status: "processed", changed: true });

        // The same delivery again, and a second event for the same order.
        await expect(
            deliver(order, "charged", `evt_paid_${order}`),
        ).resolves.toMatchObject({ status: "duplicate" });
        await expect(deliver(order, "charged")).resolves.toMatchObject({
            status: "ignored",
        });

        const view = await wallet.get(ctx.organizationId);
        expect(view.balancePaise).toBe(PACK);
        const months = (view.expiresAt!.getTime() - Date.now()) / (30 * 864e5);
        expect(months).toBeGreaterThan(11.5);
        const ledger = await prisma.messagingLedgerEntry.findMany({
            where: { organizationId: ctx.organizationId },
        });
        expect(ledger).toHaveLength(1);
        expect(ledger[0]).toMatchObject({ kind: "TOPUP", topupId: topup.id });

        const row = await prisma.messagingTopup.findUniqueOrThrow({
            where: { id: topup.id },
        });
        expect(row.status).toBe("PAID");
        const invoices = await prisma.sarohInvoice.findMany({
            where: { organizationId: ctx.organizationId },
        });
        expect(invoices).toHaveLength(1);
        expect(invoices[0]).toMatchObject({
            id: row.sarohInvoiceId,
            source: "TOPUP",
            totalPaise: withGstPaise(PACK),
        });
        await expect(topups.status(ctx, topup.id)).resolves.toMatchObject({
            status: "PAID",
        });
    });

    it("the owner's return, checked with the provider, credits once with the webhook", async () => {
        const ctx = await owner();
        const { topup } = await topups.start(ctx, "pack-a");
        const order = await orderOf(topup.id);
        fake.statuses.set(order, {
            phase: "charged",
            status: "ACTIVE",
            providerPaymentId: "pay_1",
        });
        await expect(topups.status(ctx, topup.id)).resolves.toMatchObject({
            status: "PAID",
        });
        await deliver(order, "charged");
        expect((await wallet.get(ctx.organizationId)).balancePaise).toBe(PACK);
    });

    it("a failed order credits nothing, and a later paid event doesn't either", async () => {
        const ctx = await owner();
        const { topup } = await topups.start(ctx, "pack-a");
        const order = await orderOf(topup.id);
        await deliver(order, "cancelled");
        await deliver(order, "charged");
        expect(
            (
                await prisma.messagingTopup.findUniqueOrThrow({
                    where: { id: topup.id },
                })
            ).status,
        ).toBe("FAILED");
        expect((await wallet.get(ctx.organizationId)).balancePaise).toBe(0);
        await expect(topups.status(ctx, topup.id)).resolves.toMatchObject({
            status: "FAILED",
        });
    });

    it("a second top-up adds to the balance and resets validity from now", async () => {
        const ctx = await owner();
        const first = await topups.start(ctx, "pack-a");
        await deliver(await orderOf(first.topup.id), "charged");
        const old = new Date(Date.now() + 864e5);
        await prisma.messagingWallet.update({
            where: { organizationId: ctx.organizationId },
            data: { expiresAt: old },
        });
        const second = await topups.start(ctx, "pack-a");
        await deliver(await orderOf(second.topup.id), "charged");
        const view = await wallet.get(ctx.organizationId);
        expect(view.balancePaise).toBe(2 * PACK);
        expect(view.expiresAt!.getTime()).toBeGreaterThan(
            old.getTime() + 300 * 864e5,
        );
    });

    it("refuses an unknown pack, a non-owner, and missing billing details", async () => {
        const ctx = await owner();
        await expect(topups.start(ctx, "no-such-pack")).rejects.toMatchObject({
            status: 400,
        });
        await expect(
            topups.start({ ...ctx, role: "ADMIN" }, "pack-a"),
        ).rejects.toMatchObject({ status: 403 });
        const bare = await prisma.organization.create({
            data: { name: "Pulse Fitness", slug: uniq("topup-bare") },
        });
        await expect(
            topups.start(
                { organizationId: bare.id, userId: "u", role: "OWNER" },
                "pack-a",
            ),
        ).rejects.toMatchObject({ status: 400 });
        expect(fake.orders.created).toHaveLength(0);
        await expect(
            prisma.messagingTopup.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).resolves.toBe(0);
    });

    it("another business's top-up is not found", async () => {
        const a = await owner();
        const b = await owner();
        const { topup } = await topups.start(a, "pack-a");
        await expect(topups.status(b, topup.id)).rejects.toMatchObject({
            status: 404,
        });
    });
});
