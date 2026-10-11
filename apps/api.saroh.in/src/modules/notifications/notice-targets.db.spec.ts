/**
 * Every notice opens the thing it is about, against a real Postgres
 * (10 Oct 2026): a new order's and a failed payment's notices are stored
 * with their order and invoice, the inbox reads each row with its target,
 * "Mark all as read" can be undone (and only by its own business, for its
 * own press), and the migration's backfill points yesterday's rows at
 * their things from the claims that recorded them.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { NotificationsService } from "./notifications.service";
import { tellTeam } from "./team-alert.handler";

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;
const inbox = new NotificationsService();

async function business() {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co", slug: uniq("targets") },
    });
    const owner = await prisma.user.create({
        data: { email: `${uniq("priya")}@example.com`, name: "Priya" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const ctx = {
        organizationId: org.id,
        userId: owner.id,
        role: "OWNER",
        roleKey: "OWNER",
    } satisfies OrganizationContext;
    return { organizationId: org.id, ctx };
}

async function order(organizationId: string) {
    const store = await prisma.store.create({
        data: { name: "Hill Road", slug: uniq("hill"), organizationId },
    });
    return prisma.order.create({
        data: {
            storeId: store.id,
            organizationId,
            orderId: uniq("ORD"),
            walkInName: "Asha Rao",
            subtotal: "250",
            total: "250",
            currency: "INR",
        },
    });
}

async function failedPayment(organizationId: string) {
    const invoice = await prisma.invoice.create({
        data: {
            organizationId,
            number: uniq("INV"),
            status: "ISSUED",
            currency: "INR",
            subtotal: "2400",
            total: "2400",
            billToName: "Meera Iyer",
        },
    });
    const intent = await prisma.paymentIntent.create({
        data: {
            organizationId,
            invoiceId: invoice.id,
            provider: "RAZORPAY",
            amountCents: 240000,
            currency: "INR",
            status: "FAILED",
        },
    });
    return { invoice, intent };
}

describe("notices open what they are about (real database)", () => {
    it("a new order's notice is stored with its order, and read with it", async () => {
        const b = await business();
        const o = await order(b.organizationId);

        const out = await prisma.$transaction((tx) =>
            tellTeam(tx, b.organizationId, { event: "order", orderId: o.id }),
        );

        expect(out.told).toBe(true);
        const [row] = await inbox.list(b.ctx);
        expect(row).toMatchObject({
            type: "order.new",
            orderId: o.id,
            target: { kind: "order", id: o.id },
        });
    });

    it("a failed payment's notice opens its invoice", async () => {
        const b = await business();
        const { invoice, intent } = await failedPayment(b.organizationId);

        await prisma.$transaction((tx) =>
            tellTeam(tx, b.organizationId, {
                event: "failed",
                invoiceId: invoice.id,
                paymentIntentId: intent.id,
            }),
        );

        const [row] = await inbox.list(b.ctx);
        expect(row).toMatchObject({
            type: "payment.failed",
            invoiceId: invoice.id,
            target: { kind: "invoice", id: invoice.id },
        });
    });

    it("Mark all as read is undone for that press only, and only in its own business", async () => {
        const b = await business();
        const other = await business();
        const earlier = new Date("2026-10-01T08:00:00.000Z");
        await prisma.notification.createMany({
            data: [
                {
                    organizationId: b.organizationId,
                    type: "team.joined",
                    title: "Meera joined the team",
                },
                {
                    organizationId: b.organizationId,
                    type: "team.joined",
                    title: "Ravi joined the team",
                },
                // Read by opening it, days ago: an Undo leaves it read.
                {
                    organizationId: b.organizationId,
                    type: "team.joined",
                    title: "Kiran joined the team",
                    readAt: earlier,
                },
                {
                    organizationId: other.organizationId,
                    type: "team.joined",
                    title: "Someone joined another business",
                },
            ],
        });

        const pressed = await inbox.markAllRead(b.ctx);
        expect(pressed.updated).toBe(2);
        expect(await inbox.unreadCount(b.ctx)).toEqual({ count: 0 });
        // The other business's notice was never touched.
        expect(await inbox.unreadCount(other.ctx)).toEqual({ count: 1 });

        // Another business can't undo it, even with the instant in hand.
        expect(await inbox.undoMarkAllRead(other.ctx, pressed.readAt)).toEqual({
            updated: 0,
        });
        expect(await inbox.unreadCount(b.ctx)).toEqual({ count: 0 });

        expect(await inbox.undoMarkAllRead(b.ctx, pressed.readAt)).toEqual({
            updated: 2,
        });
        expect(await inbox.unreadCount(b.ctx)).toEqual({ count: 2 });
        const kiran = await prisma.notification.findFirstOrThrow({
            where: {
                organizationId: b.organizationId,
                title: "Kiran joined the team",
            },
        });
        expect(kiran.readAt).toEqual(earlier);

        // Pressed twice, the Undo finds nothing more to give back.
        expect(await inbox.undoMarkAllRead(b.ctx, pressed.readAt)).toEqual({
            updated: 0,
        });
    });

    it("the migration points yesterday's notices at their order, booking, invoice and site", async () => {
        const b = await business();
        const o = await order(b.organizationId);
        const { invoice, intent } = await failedPayment(b.organizationId);
        const site = await prisma.site.create({
            data: {
                organizationId: b.organizationId,
                name: "Rye & Co",
                slug: uniq("site"),
            },
        });
        const publication = await prisma.publication.create({
            data: {
                siteId: site.id,
                organizationId: b.organizationId,
                snapshot: { pages: [] },
                templateId: "blank",
                templateVersion: 1,
            },
        });
        const release = await prisma.siteTestRelease.create({
            data: {
                organizationId: b.organizationId,
                siteId: site.id,
                publicationId: publication.id,
                number: 1,
                name: "Autumn menu",
                fingerprint: "f1",
                createdByUserId: b.ctx.userId,
            },
        });
        const old = async (
            type: string,
            claim: {
                eventKey: string;
                orderId?: string;
                bookingId?: string;
            },
        ) => {
            const notice = await prisma.notification.create({
                data: { organizationId: b.organizationId, type, title: type },
            });
            await prisma.customerNotice.create({
                data: {
                    organizationId: b.organizationId,
                    kind: "TEAM_TOLD",
                    notificationId: notice.id,
                    ...claim,
                },
            });
            return notice.id;
        };
        const ids = {
            order: await old("order.new", {
                eventKey: `team:order:${o.id}`,
                orderId: o.id,
            }),
            booking: await old("booking.moved", {
                eventKey: "team:booking:ev_1",
                bookingId: "bk_legacy",
            }),
            failed: await old("payment.failed", {
                eventKey: `team:failed:${intent.id}`,
            }),
            site: await old("site.live", {
                eventKey: `team:site:${release.id}:2026-10-09T10:00:00.000Z`,
            }),
            // No claim names anything for it: it keeps its nulls.
            joined: await old("team.joined", { eventKey: "team:joined:inv_1" }),
        };

        // The migration's own UPDATEs, as written (its ALTER has run: the
        // suite's schema is pushed from schema.prisma).
        const sql = readFileSync(
            join(
                __dirname,
                "../../../../../packages/database/prisma/migrations",
                "20261111100000_notification_targets/migration.sql",
            ),
            "utf8",
        );
        const updates = sql
            .split(";")
            .map((s) =>
                s
                    .split("\n")
                    .filter((line) => !line.trimStart().startsWith("--"))
                    .join("\n")
                    .trim(),
            )
            .filter((s) => s.startsWith("UPDATE"));
        expect(updates).toHaveLength(4);
        for (const statement of updates) {
            await prisma.$executeRawUnsafe(statement);
        }

        const rows = await prisma.notification.findMany({
            where: { id: { in: Object.values(ids) } },
            select: {
                id: true,
                orderId: true,
                bookingId: true,
                invoiceId: true,
                siteId: true,
            },
        });
        const of = (id: string) => rows.find((r) => r.id === id);
        expect(of(ids.order)).toMatchObject({ orderId: o.id });
        expect(of(ids.booking)).toMatchObject({ bookingId: "bk_legacy" });
        expect(of(ids.failed)).toMatchObject({ invoiceId: invoice.id });
        expect(of(ids.site)).toMatchObject({ siteId: site.id });
        expect(of(ids.joined)).toMatchObject({
            orderId: null,
            bookingId: null,
            invoiceId: null,
            siteId: null,
        });
    });
});
