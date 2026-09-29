/**
 * A subscription's log (D9) against a real Postgres: each action records
 * one event in its own transaction, a refused one records none, the renewal
 * job records each period once however often it runs, and the log reads
 * newest first with who did it. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoicesService } from "../invoices/invoices.service";
import type { OrgAction } from "../organizations/organization-actions";
import { SubscriptionRenewHandler } from "./subscription-renew.handler";
import { SubscriptionsService } from "./subscriptions.service";

const service = new SubscriptionsService(new InvoicesService());
const handler = new SubscriptionRenewHandler(service);

let shop: OrganizationContext;
let planId: string;

/** A business run by a named person, so the log can name them. */
async function namedOrg(slug: string): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name: slug, slug: `${slug}-${process.pid}` },
    });
    await giveBusinessDetails(org.id);
    const user = await prisma.user.create({
        data: { email: `${slug}-${process.pid}@example.com`, name: "Priya" },
    });
    return { organizationId: org.id, userId: user.id, role: "OWNER" };
}

let people = 0;
async function person(ctx: OrganizationContext): Promise<string> {
    people += 1;
    return (
        await prisma.contact.create({
            data: {
                organizationId: ctx.organizationId,
                email: `member-${people}@example.com`,
                firstName: "Asha",
            },
        })
    ).id;
}

async function subscribe(ctx = shop, plan = planId) {
    return service.subscribe(ctx, {
        contactId: await person(ctx),
        planId: plan,
    });
}

/** Push a subscription's period into the past so it is due now. */
async function makeDue(id: string): Promise<void> {
    const start = new Date(Date.now() - 40 * 86_400_000);
    await prisma.customerSubscription.update({
        where: { id },
        data: {
            anchorAt: start,
            currentPeriodStart: start,
            currentPeriodEnd: new Date(Date.now() - 86_400_000),
        },
    });
}

const kinds = async (subscriptionId: string) =>
    (
        await prisma.subscriptionEvent.findMany({
            where: { subscriptionId },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })
    ).map((e) => e.kind);

beforeAll(async () => {
    shop = await namedOrg("sub-events");
    planId = (
        await service.createPlan(shop, {
            name: "Monthly",
            price: "1200",
            currency: "INR",
            interval: "MONTH",
        })
    ).id;
});

describe("a subscription's log (D9, real database)", () => {
    it("records a pause and a resume in order, each by the person who did it", async () => {
        const s = await subscribe();
        await service.pause(shop, s.id);
        await service.resume(shop, s.id);

        expect(await kinds(s.id)).toEqual(["SUBSCRIBED", "PAUSED", "RESUMED"]);
        const page = await service.events(shop, s.id, {});
        expect(page.events.map((e) => [e.kind, e.actor])).toEqual([
            ["RESUMED", { kind: "TEAM", userId: shop.userId, name: "Priya" }],
            ["PAUSED", { kind: "TEAM", userId: shop.userId, name: "Priya" }],
            [
                "SUBSCRIBED",
                { kind: "TEAM", userId: shop.userId, name: "Priya" },
            ],
        ]);
        expect(page.earlierUnrecorded).toBe(false);
        // The subscribe names its first invoice, by number.
        const first = await prisma.invoice.findFirstOrThrow({
            where: { subscriptionId: s.id },
        });
        expect(page.events[2]!.invoice).toEqual({
            id: first.id,
            number: first.number,
        });
    });

    it("records nothing for a refused action", async () => {
        const s = await subscribe();
        await service.cancel(shop, s.id, { when: "now" });
        await expect(service.pause(shop, s.id)).rejects.toMatchObject({
            status: 409,
        });
        await expect(
            service.cancel(shop, s.id, { when: "now" }),
        ).rejects.toMatchObject({ status: 409 });
        await expect(service.keep(shop, s.id)).rejects.toMatchObject({
            status: 409,
        });
        expect(await kinds(s.id)).toEqual(["SUBSCRIBED", "CANCELLED"]);
    });

    it("records nothing when a resume is refused inside its transaction", async () => {
        const s = await subscribe();
        await service.pause(shop, s.id);
        // Paused past its paid period, with Payments off: restarting would
        // bill, and that is refused after the row lock is taken.
        await makeDue(s.id);
        await prisma.organizationModule.create({
            data: {
                organizationId: shop.organizationId,
                moduleKey: "PAYMENTS",
                status: "DISABLED",
            },
        });
        try {
            await expect(service.resume(shop, s.id)).rejects.toThrow();
        } finally {
            await prisma.organizationModule.deleteMany({
                where: { organizationId: shop.organizationId },
            });
        }
        expect(await kinds(s.id)).toEqual(["SUBSCRIBED", "PAUSED"]);
    });

    it("records each renewal once, with its invoice, however often and however concurrently the job runs", async () => {
        const s = await subscribe();
        await makeDue(s.id);
        const now = new Date();
        await Promise.all([
            service.renewOne(s.id, now),
            service.renewOne(s.id, now),
            service.renewOne(s.id, now),
        ]);
        // A redelivered run on the same day.
        await handler.renewDue(now);

        const renewed = await prisma.subscriptionEvent.findMany({
            where: { subscriptionId: s.id, kind: "RENEWED" },
        });
        expect(renewed).toHaveLength(1);
        // The renewal's, not the subscribe's: the newest issued.
        const invoice = await prisma.invoice.findFirstOrThrow({
            where: { subscriptionId: s.id },
            orderBy: { createdAt: "desc" },
        });
        expect(renewed[0]).toMatchObject({
            actorKind: "JOB",
            actorUserId: null,
            invoiceId: invoice.id,
        });
        const page = await service.events(shop, s.id, {});
        expect(page.events[0]!.actor).toEqual({
            kind: "JOB",
            userId: null,
            name: "Saroh",
        });
    });

    it("records the job ending one set to end with its period", async () => {
        const s = await subscribe();
        await service.cancel(shop, s.id, { when: "periodEnd" });
        await makeDue(s.id);
        await service.renewOne(s.id, new Date());
        expect(await kinds(s.id)).toEqual([
            "SUBSCRIBED",
            "CANCEL_SCHEDULED",
            "ENDED",
        ]);
    });

    it("shows a Saroh operator as Saroh support, never by name or id", async () => {
        const s = await subscribe();
        await service.pause(
            { ...shop, userId: "op_1", roleKey: "platform-operator" },
            s.id,
        );
        const [latest] = (await service.events(shop, s.id, {})).events;
        expect(latest).toMatchObject({
            kind: "PAUSED",
            actor: { kind: "OPERATOR", userId: null, name: "Saroh support" },
        });
    });

    it("leaves out which invoice for someone who can't read invoices", async () => {
        const s = await subscribe();
        const viewer: OrganizationContext = {
            ...shop,
            role: "MEMBER",
            actions: new Set<OrgAction>(["subscription:read"]),
        };
        const page = await service.events(viewer, s.id, {});
        expect(page.events[0]).toMatchObject({
            kind: "SUBSCRIBED",
            invoice: null,
        });
    });

    it("pages the log by the last event read", async () => {
        const s = await subscribe();
        for (let i = 0; i < 2; i += 1) {
            await service.pause(shop, s.id);
            await service.resume(shop, s.id);
        }
        const first = await service.events(shop, s.id, { limit: 2 });
        const second = await service.events(shop, s.id, {
            limit: 2,
            cursor: first.nextCursor!,
        });
        const third = await service.events(shop, s.id, {
            limit: 2,
            cursor: second.nextCursor!,
        });
        expect(
            [...first.events, ...second.events, ...third.events].map(
                (e) => e.kind,
            ),
        ).toEqual(["RESUMED", "PAUSED", "RESUMED", "PAUSED", "SUBSCRIBED"]);
        expect(third.nextCursor).toBeNull();
    });

    it("says earlier changes weren't recorded for a subscription made before the log", async () => {
        const older = await prisma.customerSubscription.create({
            data: {
                organizationId: shop.organizationId,
                planId,
                contactId: await person(shop),
                price: "1200",
                currency: "INR",
                interval: "MONTH",
                timezone: "UTC",
                anchorAt: new Date(),
                currentPeriodStart: new Date(),
                currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
            },
        });
        expect(await service.events(shop, older.id, {})).toEqual({
            events: [],
            nextCursor: null,
            earlierUnrecorded: true,
        });
        await service.pause(shop, older.id);
        const page = await service.events(shop, older.id, {});
        expect(page.events.map((e) => e.kind)).toEqual(["PAUSED"]);
        expect(page.earlierUnrecorded).toBe(true);
    });

    it("answers another business's subscription with a 404, and refuses its events as a cursor", async () => {
        const other = await namedOrg("sub-events-other");
        const otherPlan = await service.createPlan(other, {
            name: "Monthly",
            price: "900",
            currency: "INR",
            interval: "MONTH",
        });
        const mine = await subscribe();
        const theirs = await subscribe(other, otherPlan.id);
        await expect(service.events(other, mine.id, {})).rejects.toMatchObject({
            status: 404,
        });
        const [mineEvent] = await prisma.subscriptionEvent.findMany({
            where: { subscriptionId: mine.id },
        });
        await expect(
            service.events(other, theirs.id, { cursor: mineEvent!.id }),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("refuses an event naming another business's subscription", async () => {
        const other = await namedOrg("sub-events-fk");
        const mine = await subscribe();
        await expect(
            prisma.subscriptionEvent.create({
                data: {
                    organizationId: other.organizationId,
                    subscriptionId: mine.id,
                    kind: "PAUSED",
                    actorKind: "TEAM",
                },
            }),
        ).rejects.toThrow();
    });
});
