/**
 * Home's F1 sources (round 2) against a real Postgres: a renewal two days
 * past due is one failed-renewal row and never also an overdue invoice; a
 * hand-written invoice is an overdue invoice; an order's invoice, a draft
 * and a credit note never are; a cancelled subscription's unpaid bill is
 * still an invoice owed; a site with nothing published is not live; a shelf
 * short for orders shows until its check is resolved, and not at all when
 * the business doesn't track stock. Another business's rows are never seen.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import { StockChecksService } from "../stock/stock-checks.service";
import {
    failedRenewals,
    overdueInvoices,
    readRenewalSignals,
} from "./home-money-sources";
import { sitesNotLive, stockShort } from "./home-site-stock-sources";

const tag = `${process.pid}-${Date.now()}`;
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-27T06:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const TWO_DAYS_AGO = ago(2 * DAY + 60 * 60 * 1000);

const checks = new StockChecksService({} as never);

describe("Home F1 sources (DB)", () => {
    let orgId = "";
    let otherOrgId = "";
    let liveSubId = "";
    let liveInvoiceId = "";
    let cancelledInvoiceId = "";
    let handInvoiceId = "";
    let shortLevelId = "";

    async function invoice(
        organizationId: string,
        data: Record<string, unknown>,
    ) {
        return prisma.invoice.create({
            data: {
                organizationId,
                status: "ISSUED",
                currency: "INR",
                subtotal: "1200",
                total: "1200",
                issuedAt: ago(9 * DAY),
                dueAt: TWO_DAYS_AGO,
                ...data,
            },
        });
    }

    async function subscription(
        organizationId: string,
        planId: string,
        status: string,
        who: string,
    ) {
        const contact = await prisma.contact.create({
            data: {
                organizationId,
                email: `${who}-${tag}@example.com`,
                firstName: who,
            },
        });
        return prisma.customerSubscription.create({
            data: {
                organizationId,
                planId,
                contactId: contact.id,
                status,
                price: "1200",
                currency: "INR",
                interval: "MONTH",
                timezone: "Asia/Kolkata",
                anchorAt: ago(40 * DAY),
                currentPeriodStart: ago(9 * DAY),
                currentPeriodEnd: new Date(NOW.getTime() + 21 * DAY),
                cancelledAt: status === "CANCELLED" ? ago(DAY) : null,
            },
        });
    }

    beforeAll(async () => {
        orgId = (
            await prisma.organization.create({
                data: { name: "Pulse Fitness", slug: `home-f1-${tag}` },
            })
        ).id;
        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Elsewhere", slug: `home-f1-else-${tag}` },
            })
        ).id;

        for (const organizationId of [orgId, otherOrgId]) {
            const plan = await prisma.subscriptionPlan.create({
                data: {
                    organizationId,
                    name: "Monthly membership",
                    price: "1200",
                    currency: "INR",
                    interval: "MONTH",
                },
            });
            const live = await subscription(
                organizationId,
                plan.id,
                "ACTIVE",
                `meera-${organizationId}`,
            );
            // Last month's, paid; this month's, two days past due.
            await invoice(organizationId, {
                subscriptionId: live.id,
                source: "SUBSCRIPTION",
                status: "PAID",
                issuedAt: ago(40 * DAY),
                dueAt: ago(33 * DAY),
                paidAt: ago(35 * DAY),
                periodStart: ago(40 * DAY),
            });
            const current = await invoice(organizationId, {
                subscriptionId: live.id,
                source: "SUBSCRIPTION",
                periodStart: ago(9 * DAY),
            });
            if (organizationId === orgId) {
                liveSubId = live.id;
                liveInvoiceId = current.id;
            }
        }

        const plan2 = await prisma.subscriptionPlan.create({
            data: {
                organizationId: orgId,
                name: "Yoga ten-pack",
                price: "900",
                currency: "INR",
                interval: "MONTH",
            },
        });
        // A cancelled subscription's unpaid bill: still owed, as an invoice.
        const cancelled = await subscription(
            orgId,
            plan2.id,
            "CANCELLED",
            "ravi",
        );
        cancelledInvoiceId = (
            await invoice(orgId, {
                subscriptionId: cancelled.id,
                source: "SUBSCRIPTION",
                periodStart: ago(9 * DAY),
                billToName: "Ravi",
            })
        ).id;
        // A live subscription whose older bill is unpaid but whose latest
        // renewal is paid: not a failed renewal.
        const behind = await subscription(orgId, plan2.id, "ACTIVE", "asha");
        await invoice(orgId, {
            subscriptionId: behind.id,
            source: "SUBSCRIPTION",
            issuedAt: ago(40 * DAY),
            dueAt: ago(33 * DAY),
            periodStart: ago(40 * DAY),
        });
        await invoice(orgId, {
            subscriptionId: behind.id,
            source: "SUBSCRIPTION",
            status: "PAID",
            paidAt: ago(8 * DAY),
            periodStart: ago(9 * DAY),
        });

        // A hand-written invoice two days past due.
        handInvoiceId = (
            await invoice(orgId, {
                number: `INV-${tag}`,
                billToName: "Café Mocha",
                total: "4000",
                subtotal: "4000",
            })
        ).id;
        // Never overdue: a draft, a credit note, and an order's own invoice.
        await invoice(orgId, { status: "DRAFT", issuedAt: null });
        await invoice(orgId, { kind: "CREDIT_NOTE" });
        const store = await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `home-f1-hill-${tag}`,
                organizationId: orgId,
            },
        });
        const customer = await prisma.customer.create({
            data: {
                storeId: store.id,
                organizationId: orgId,
                email: `buyer-${tag}@example.com`,
            },
        });
        const order = await prisma.order.create({
            data: {
                storeId: store.id,
                organizationId: orgId,
                orderId: `ORD-F1-${tag}`,
                customerId: customer.id,
                subtotal: "250",
                total: "250",
                currency: "INR",
            },
        });
        await invoice(orgId, { orderId: order.id, source: "ORDER" });

        // Sites: one never published, one live, one deleted.
        const draftSite = await prisma.site.create({
            data: {
                organizationId: orgId,
                name: "Pulse Fitness",
                slug: `f1-draft-${tag}`,
            },
        });
        const liveSite = await prisma.site.create({
            data: {
                organizationId: orgId,
                name: "Classes",
                slug: `f1-live-${tag}`,
            },
        });
        const publication = await prisma.publication.create({
            data: {
                siteId: liveSite.id,
                organizationId: orgId,
                snapshot: {},
                templateId: "t",
                templateVersion: 1,
            },
        });
        await prisma.site.update({
            where: { id: liveSite.id },
            data: { currentPublicationId: publication.id },
        });
        await prisma.site.create({
            data: {
                organizationId: orgId,
                name: "Old",
                slug: `f1-old-${tag}`,
                deletedAt: ago(DAY),
            },
        });
        await prisma.site.create({
            data: {
                organizationId: otherOrgId,
                name: "Theirs",
                slug: `f1-theirs-${tag}`,
            },
        });
        expect(draftSite.id).toBeTruthy();

        // A shelf with 2 promised and none on hand; one that covers its orders.
        const shirt = await prisma.product.create({
            data: {
                organizationId: orgId,
                storeId: store.id,
                name: "Linen shirt",
                slug: `f1-shirt-${tag}`,
                price: "40",
                stockTracked: true,
            },
        });
        const cap = await prisma.product.create({
            data: {
                organizationId: orgId,
                storeId: store.id,
                name: "Cap",
                slug: `f1-cap-${tag}`,
                price: "10",
                stockTracked: true,
            },
        });
        shortLevelId = (
            await prisma.stockLevel.create({
                data: {
                    organizationId: orgId,
                    storeId: store.id,
                    productId: shirt.id,
                    onHand: 0,
                    promised: 2,
                },
            })
        ).id;
        await prisma.stockLevel.create({
            data: {
                organizationId: orgId,
                storeId: store.id,
                productId: cap.id,
                onHand: 5,
                promised: 1,
            },
        });
    });

    it("gives the live subscription's renewal two days past due as one failed renewal", async () => {
        const action = await failedRenewals(prisma, orgId, NOW, true);

        expect(action?.count).toBe(1);
        expect(action?.evidence).toEqual([
            expect.objectContaining({
                id: liveSubId,
                title: "Monthly membership",
                amountMinor: 120000,
                currency: "INR",
                href: `/billing/subscriptions/${liveSubId}`,
                tag: "Overdue 2 days",
            }),
        ]);
    });

    it("lists the hand-written and the cancelled subscription's invoices as overdue, and never the live renewal's", async () => {
        const action = await overdueInvoices(prisma, orgId, NOW);
        const ids = action?.evidence?.map((e) => e.id) ?? [];

        expect(action?.count).toBe(2);
        expect(ids.sort()).toEqual([cancelledInvoiceId, handInvoiceId].sort());
        expect(ids).not.toContain(liveInvoiceId);
        const hand = action?.evidence?.find((e) => e.id === handInvoiceId);
        expect(hand).toMatchObject({
            subtitle: "Café Mocha",
            amountMinor: 400000,
            tag: "Overdue 2 days",
        });
    });

    it("lists nothing overdue before anything falls due", async () => {
        expect(await overdueInvoices(prisma, orgId, ago(30 * DAY))).toBeNull();
        expect(await failedRenewals(prisma, orgId, ago(3 * DAY), true)).toBe(
            null,
        );
    });

    it("names only this business's site that isn't live", async () => {
        const action = await sitesNotLive(prisma, orgId);

        expect(action?.count).toBe(1);
        expect(action?.evidence?.map((e) => e.title)).toEqual([
            "Pulse Fitness",
        ]);
    });

    it("shows the short shelf until its check is resolved as it stands", async () => {
        const action = await stockShort(prisma, checks, orgId);
        expect(action?.count).toBe(1);
        expect(action?.title).toBe("1 item is short for orders");
        expect(action?.evidence?.[0]).toMatchObject({
            id: `short:${shortLevelId}`,
            title: "Linen shirt",
            subtitle: "2 short at Hill Road",
        });

        await prisma.stockCheckResolution.create({
            data: {
                organizationId: orgId,
                key: `short:${shortLevelId}`,
                kind: "SHORT",
                fingerprint: "0:2",
                stockLevelId: shortLevelId,
            },
        });
        expect(await stockShort(prisma, checks, orgId)).toBeNull();

        // Its numbers move on, so it opens again.
        await prisma.stockLevel.update({
            where: { id: shortLevelId },
            data: { promised: 3 },
        });
        expect((await stockShort(prisma, checks, orgId))?.count).toBe(1);
    });

    it("gives no stock row when the business doesn't track stock", async () => {
        await prisma.businessProfile.upsert({
            where: { organizationId: orgId },
            create: { organizationId: orgId, stockTracking: false },
            update: { stockTracking: false },
        });
        try {
            expect(await stockShort(prisma, checks, orgId)).toBeNull();
        } finally {
            await prisma.businessProfile.update({
                where: { organizationId: orgId },
                data: { stockTracking: true },
            });
        }
    });

    it("sees nothing of another business", async () => {
        const theirs = await failedRenewals(prisma, otherOrgId, NOW, true);
        expect(theirs?.evidence?.map((e) => e.id)).not.toContain(liveSubId);
        expect(await stockShort(prisma, checks, otherOrgId)).toBeNull();
        expect(
            (await sitesNotLive(prisma, otherOrgId))?.evidence?.map(
                (e) => e.title,
            ),
        ).toEqual(["Theirs"]);
    });

    it("reads a renewal's RENEWAL_FAILED and MANDATE_LIMIT_LOW from the subscription log (D9), only this business's", async () => {
        const theirs = await prisma.customerSubscription.findFirstOrThrow({
            where: { organizationId: otherOrgId },
            select: { id: true },
        });
        const event = (
            organizationId: string,
            subscriptionId: string,
            kind: string,
            createdAt: Date,
        ) =>
            prisma.subscriptionEvent.create({
                data: {
                    organizationId,
                    subscriptionId,
                    kind,
                    actorKind: "JOB",
                    createdAt,
                },
            });
        await event(orgId, liveSubId, "PAUSED", ago(DAY));
        await event(orgId, liveSubId, "RENEWAL_FAILED", ago(3 * DAY));
        await event(orgId, liveSubId, "MANDATE_LIMIT_LOW", ago(2 * DAY));
        await event(otherOrgId, theirs.id, "RENEWAL_FAILED", ago(DAY));

        const signals = await readRenewalSignals(prisma, orgId, [
            liveSubId,
            theirs.id,
        ]);
        expect(signals.sort((a, b) => a.at.getTime() - b.at.getTime())).toEqual(
            [
                {
                    subscriptionId: liveSubId,
                    kind: "RENEWAL_FAILED",
                    at: ago(3 * DAY),
                },
                {
                    subscriptionId: liveSubId,
                    kind: "MANDATE_LIMIT_LOW",
                    at: ago(2 * DAY),
                },
            ],
        );
        expect(await readRenewalSignals(prisma, orgId, [])).toEqual([]);

        // The latest since the unpaid invoice was issued names the row.
        const action = await failedRenewals(prisma, orgId, NOW, true);
        expect(action?.evidence?.[0]).toMatchObject({
            id: liveSubId,
            tag: "Autopay limit too low",
        });
    });
});
