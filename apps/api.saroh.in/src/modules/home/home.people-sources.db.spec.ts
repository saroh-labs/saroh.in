/**
 * Home's people sources (round 2, F2) against a real Postgres: a low-rated
 * review leaves Needs you once it's answered; a booking-page note waits
 * until staff confirm it, and is "Before their visit" only for a confirmed
 * visit in the next two days; a customer waits on the team until the team
 * writes back — Saroh's own post doesn't count — and only after an hour;
 * a merged-away person is never listed; and another business's rows are
 * never seen.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import type { OrgAction } from "../organizations/organization-actions";
import { appendMessage } from "../site-accounts/thread-store";
import { ThreadsService } from "../site-accounts/threads.service";
import {
    bookingPageNotes,
    lowStarReviews,
    MESSAGE_WAIT_MS,
} from "./home-people-sources";

const tag = `${process.pid}-${Date.now()}`;
const ZONE = "Asia/Kolkata";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-09-27T06:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const ahead = (ms: number) => new Date(NOW.getTime() + ms);

const originalSwitch = env.SITE_ACCOUNT_AREA;

let orgId = "";
let otherOrgId = "";
let seq = 0;

function owner(organizationId = orgId): OrganizationContext {
    return { organizationId, userId: "", role: "OWNER" };
}

async function contact(
    organizationId: string,
    firstName: string,
    over: { mergedIntoId?: string } = {},
) {
    return prisma.contact.create({
        data: {
            organizationId,
            firstName,
            lastName: "Test",
            email: `${firstName.toLowerCase()}-${++seq}-${tag}@example.com`,
            ...over,
        },
    });
}

beforeAll(async () => {
    orgId = (
        await prisma.organization.create({
            data: { name: "Kavi Dental", slug: `home-f2-${tag}` },
        })
    ).id;
    otherOrgId = (
        await prisma.organization.create({
            data: { name: "Elsewhere", slug: `home-f2-other-${tag}` },
        })
    ).id;
});

afterAll(() => {
    env.SITE_ACCOUNT_AREA = originalSwitch;
});

describe("lowStarReviews (DB)", () => {
    let storeId = "";
    let invitationId = "";

    async function review(
        organizationId: string,
        rating: number,
        over: Record<string, unknown> = {},
    ) {
        return prisma.productReview.create({
            data: {
                organizationId,
                storeId: organizationId === orgId ? storeId : theirStoreId,
                invitationId:
                    organizationId === orgId ? invitationId : theirInvitationId,
                productName: `Loaf ${++seq}`,
                invitedTo: "buyer@example.com",
                rating,
                displayName: "Farah Khan",
                body: "Too dry.",
                ...over,
            },
        });
    }

    let theirStoreId = "";
    let theirInvitationId = "";

    async function invitation(organizationId: string, sId: string) {
        const customer = await prisma.customer.create({
            data: {
                storeId: sId,
                organizationId,
                email: `buyer-${++seq}-${tag}@example.com`,
            },
        });
        const order = await prisma.order.create({
            data: {
                storeId: sId,
                organizationId,
                customerId: customer.id,
                orderId: `F2-${seq}-${tag}`,
                subtotal: "250",
                total: "250",
                currency: "INR",
            },
        });
        return prisma.reviewInvitation.create({
            data: {
                organizationId,
                orderId: order.id,
                tokenHash: `f2-${seq}-${tag}`,
                toAddress: "buyer@example.com",
                expiresAt: ahead(3 * DAY),
            },
        });
    }

    beforeAll(async () => {
        storeId = (
            await prisma.store.create({
                data: {
                    name: "Hill Road",
                    slug: `home-f2-hill-${tag}`,
                    organizationId: orgId,
                },
            })
        ).id;
        theirStoreId = (
            await prisma.store.create({
                data: {
                    name: "Elsewhere",
                    slug: `home-f2-else-${tag}`,
                    organizationId: otherOrgId,
                },
            })
        ).id;
        invitationId = (await invitation(orgId, storeId)).id;
        theirInvitationId = (await invitation(otherOrgId, theirStoreId)).id;
    });

    it("lists an unanswered review at three stars or fewer, and drops it once it's answered", async () => {
        const low = await review(orgId, 1, { createdAt: ago(DAY) });
        const three = await review(orgId, 3, { createdAt: ago(2 * DAY) });
        await review(orgId, 4);
        await review(orgId, 2, {
            reply: "Sorry — we've changed flour since.",
            repliedAt: ago(HOUR),
        });
        await review(orgId, 1, { status: "HIDDEN", hiddenAt: ago(HOUR) });
        await review(otherOrgId, 1);

        const before = await lowStarReviews(prisma, orgId);
        expect(before?.count).toBe(2);
        // Newest first.
        expect(before?.evidence?.map((e) => e.id)).toEqual([low.id, three.id]);
        expect(before?.evidence?.[0]).toMatchObject({
            tag: "1 star",
            subtitle: "Farah Khan",
            detail: "“Too dry.”",
        });

        await prisma.productReview.update({
            where: { id: low.id },
            data: { reply: "Thank you — we'll make it right.", repliedAt: NOW },
        });
        const after = await lowStarReviews(prisma, orgId);
        expect(after?.evidence?.map((e) => e.id)).toEqual([three.id]);
    });
});

describe("bookingPageNotes (DB)", () => {
    let serviceId = "";

    async function booking(startAt: Date, status = "CONFIRMED") {
        return prisma.booking.create({
            data: {
                organizationId: orgId,
                serviceId,
                startAt,
                endAt: new Date(startAt.getTime() + 30 * 60_000),
                timezone: ZONE,
                status,
                bookerName: "Rahul",
                snapshot: {},
            },
        });
    }

    async function suggestion(
        organizationId: string,
        contactId: string,
        bookingId: string | null,
        over: Record<string, unknown> = {},
    ) {
        return prisma.contactAttention.create({
            data: {
                organizationId,
                contactId,
                kind: "MEDICAL",
                label: "Allergic to latex",
                detail: "Allergic to latex, please use nitrile.",
                sensitive: true,
                source: "BOOKING_PAGE",
                status: "SUGGESTED",
                bookingId,
                ...over,
            },
        });
    }

    beforeAll(async () => {
        serviceId = (
            await prisma.service.create({
                data: {
                    organizationId: orgId,
                    name: "Cleaning",
                    durationMinutes: 30,
                    capacity: 1,
                    priceCents: 50_000,
                    currency: "INR",
                    timezone: ZONE,
                },
            })
        ).id;
    });

    it("puts a note for a visit in the next two days first, and leaves out what staff have settled", async () => {
        const rahul = await contact(orgId, "Rahul");
        const meera = await contact(orgId, "Meera");
        const kabir = await contact(orgId, "Kabir");
        const survivor = await contact(orgId, "Sana");
        const gone = await contact(orgId, "Sana", {
            mergedIntoId: survivor.id,
        });
        const theirs = await contact(otherOrgId, "Elsewhere");

        const soon = await suggestion(
            orgId,
            rahul.id,
            (await booking(ahead(DAY))).id,
        );
        // Further out, a cancelled visit close by, and one whose booking
        // has gone: each still waits, but not "before their visit".
        const later = await suggestion(
            orgId,
            meera.id,
            (await booking(ahead(9 * DAY))).id,
            { createdAt: ago(3 * DAY) },
        );
        const cancelled = await suggestion(
            orgId,
            kabir.id,
            (await booking(ahead(HOUR), "CANCELLED")).id,
            { createdAt: ago(2 * DAY) },
        );
        const orphan = await suggestion(orgId, kabir.id, null, {
            createdAt: ago(DAY),
        });
        // Settled: confirmed onto the record, or set aside.
        await suggestion(orgId, rahul.id, null, { status: "ACTIVE" });
        await suggestion(orgId, rahul.id, null, { removedAt: ago(HOUR) });
        // Staff's own entry, a merged-away person's, another business's.
        await suggestion(orgId, rahul.id, null, { source: "STAFF" });
        await suggestion(orgId, gone.id, null);
        await suggestion(otherOrgId, theirs.id, null);

        const action = await bookingPageNotes(prisma, owner(), NOW);
        expect(action?.count).toBe(4);
        expect(action?.evidence?.map((e) => [e.id, e.tag, e.headline])).toEqual(
            [
                [
                    soon.id,
                    "Before their visit",
                    "Rahul Test left a note when booking",
                ],
                [later.id, "To check", "Meera Test left a note when booking"],
                [
                    cancelled.id,
                    "To check",
                    "Kabir Test left a note when booking",
                ],
                [orphan.id, "To check", "Kabir Test left a note when booking"],
            ],
        );
        expect(action?.evidence?.[0].href).toBe(`/customers/${rahul.id}`);
    });

    it("gives a Member nothing, not even a count", async () => {
        const member: OrganizationContext = { ...owner(), role: "MEMBER" };
        expect(await bookingPageNotes(prisma, member, NOW)).toBeNull();
    });
});

describe("ThreadsService.waitingOnTeam (DB)", () => {
    const threads = new ThreadsService();
    const view = { now: NOW, olderThanMs: MESSAGE_WAIT_MS, limit: 5 };

    async function say(
        organizationId: string,
        contactId: string,
        author: "CUSTOMER" | "STAFF" | "SYSTEM",
        at: Date,
        body = "Hello",
    ) {
        await prisma.$transaction((tx) =>
            appendMessage(tx, {
                organizationId,
                contactId,
                author,
                body,
                now: at,
            }),
        );
    }

    beforeEach(() => {
        env.SITE_ACCOUNT_AREA = "on";
    });

    it("lists who waits on the team for over an hour, longest first, and not those answered", async () => {
        const farah = await contact(orgId, "Farah");
        const anika = await contact(orgId, "Anika");
        const answered = await contact(orgId, "Dev");
        const fresh = await contact(orgId, "Isha");
        const invoiced = await contact(orgId, "Omar");
        const survivor = await contact(orgId, "Zara");
        const gone = await contact(orgId, "Zara", {
            mergedIntoId: survivor.id,
        });
        const theirs = await contact(otherOrgId, "Elsewhere");

        // Farah wrote twice after the team's last answer, 2 days ago first.
        await say(orgId, farah.id, "CUSTOMER", ago(5 * DAY), "Hi");
        await say(orgId, farah.id, "STAFF", ago(4 * DAY), "Hello!");
        await say(orgId, farah.id, "CUSTOMER", ago(2 * DAY), "One more thing");
        await say(orgId, farah.id, "CUSTOMER", ago(3 * HOUR), "Anyone there?");
        // Anika wrote 3 hours ago and nobody has answered.
        await say(orgId, anika.id, "CUSTOMER", ago(3 * HOUR), "Can I move?");
        // Dev was answered.
        await say(orgId, answered.id, "CUSTOMER", ago(5 * HOUR));
        await say(orgId, answered.id, "STAFF", ago(4 * HOUR));
        // Isha wrote ten minutes ago: not yet an hour.
        await say(orgId, fresh.id, "CUSTOMER", ago(10 * 60_000));
        // Omar's only reply is Saroh's invoice post: it answers nothing.
        await say(orgId, invoiced.id, "CUSTOMER", ago(6 * HOUR), "Bill?");
        await say(orgId, invoiced.id, "SYSTEM", ago(5 * HOUR), "Invoice sent");
        // A merged-away person's thread, and another business's.
        await say(orgId, gone.id, "CUSTOMER", ago(8 * HOUR));
        await say(otherOrgId, theirs.id, "CUSTOMER", ago(8 * HOUR));

        const waiting = await threads.waitingOnTeam(owner(), view);
        expect(waiting.count).toBe(3);
        expect(waiting.longWaits).toBe(1);
        expect(
            waiting.threads.map((t) => [t.name, t.messages, t.lastBody]),
        ).toEqual([
            ["Farah Test", 2, "Anyone there?"],
            ["Omar Test", 1, "Bill?"],
            ["Anika Test", 1, "Can I move?"],
        ]);
        expect(waiting.threads[0].since).toEqual(ago(2 * DAY));

        // A limit keeps the count whole.
        const one = await threads.waitingOnTeam(owner(), { ...view, limit: 1 });
        expect(one.count).toBe(3);
        expect(one.threads).toHaveLength(1);

        // The team answers Farah: she's no longer waiting.
        await say(orgId, farah.id, "STAFF", ago(HOUR));
        const after = await threads.waitingOnTeam(owner(), view);
        expect(after.threads.map((t) => t.name)).toEqual([
            "Omar Test",
            "Anika Test",
        ]);
    });

    it("reads nothing while the account area is off", async () => {
        env.SITE_ACCOUNT_AREA = "off";
        const waiting = await threads.waitingOnTeam(owner(), view);
        expect(waiting).toEqual({ count: 0, longWaits: 0, threads: [] });
    });

    it("refuses a viewer without message:read", async () => {
        const ctx: OrganizationContext = {
            ...owner(),
            actions: new Set<OrgAction>(["contact:read"]),
        };
        await expect(threads.waitingOnTeam(ctx, view)).rejects.toThrow(
            /message:read/,
        );
    });
});
