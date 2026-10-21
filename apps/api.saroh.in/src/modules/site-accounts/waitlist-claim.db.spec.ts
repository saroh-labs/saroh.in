/**
 * The waitlist offer's claim link against a real Postgres (U18, #1149):
 * the offer's email carries it, the claim page's read shows the class and
 * the hold, booking it through the normal path takes the place (ACCEPTED)
 * and spends the link, an offer whose hold ran out has ended, a place
 * taken while held has gone, a cancelled class offers no way back, and a
 * link opened on another business's site, or a forged one, is not found.
 *
 * Runs in the integration project (TEST_DATABASE_URL), plain and with
 * TEST_RLS=on.
 */
import { HttpException, NotFoundException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import type { SignedInCustomer } from "../bookings/public-bookings.service";
import { PublicBookingsService } from "../bookings/public-bookings.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { loadSubject } from "./customer-notify.handler";
import { renderNotice } from "./notify-templates";
import { siteCodeSecret } from "./site-secrets";
import { signClaimToken, verifyClaimToken } from "./waitlist-claim";
import { WaitlistClaimService } from "./waitlist-claim.service";

const claims = new WaitlistClaimService(new FixedWindowRateLimiter(1_000));
const publicBookings = new PublicBookingsService(
    new FixedWindowRateLimiter(1_000),
);

const MONDAY = 1;
const HOUR = 3_600_000;
let orgId: string;
let siteId: string;
let otherSiteId: string;
let seq = 0;

/** The Monday `weeksOut` weeks ahead, at 07:00 UTC. */
function nextMonday(weeksOut = 1): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const ahead = (MONDAY - d.getUTCDay() + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + ahead + (weeksOut - 1) * 7);
    d.setUTCHours(7);
    return d;
}

async function publishedSite(
    organizationId: string,
    subdomain: string,
): Promise<string> {
    const site = await prisma.site.create({
        data: {
            organizationId,
            name: "Site",
            slug: `u18-${subdomain}`,
            subdomain,
        },
    });
    const publication = await prisma.publication.create({
        data: {
            siteId: site.id,
            organizationId,
            snapshot: { pages: [] },
            templateId: "blank",
            templateVersion: 1,
        },
    });
    await prisma.site.update({
        where: { id: site.id },
        data: { currentPublicationId: publication.id },
    });
    return site.id;
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Pulse Fitness", slug: `u18-claim-${process.pid}` },
    });
    orgId = org.id;
    await prisma.businessProfile.create({
        data: { organizationId: orgId, timezone: "UTC" },
    });
    siteId = await publishedSite(orgId, `u18-pulse-${process.pid}`);
    const other = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `u18-other-${process.pid}` },
    });
    otherSiteId = await publishedSite(other.id, `u18-rye-${process.pid}`);
});

/** A class of `capacity` places on Monday mornings, 07:00–08:00 UTC. */
async function classOf(capacity: number): Promise<string> {
    seq += 1;
    const service = await prisma.service.create({
        data: {
            organizationId: orgId,
            name: `Spin ${seq}`,
            durationMinutes: 60,
            capacity,
            priceCents: 50_000,
            currency: "INR",
            timezone: "UTC",
            availabilityRules: {
                create: {
                    organizationId: orgId,
                    dayOfWeek: MONDAY,
                    startMinute: 7 * 60,
                    endMinute: 8 * 60,
                },
            },
        },
    });
    return service.id;
}

/** A signed-in customer of the business: a contact and its site account. */
async function customer(): Promise<SignedInCustomer> {
    seq += 1;
    const email = `u18-person-${seq}-${process.pid}@example.com`;
    const contact = await prisma.contact.create({
        data: { organizationId: orgId, email, firstName: "Sneha" },
    });
    const account = await prisma.customerAccount.create({
        data: {
            organizationId: orgId,
            contactId: contact.id,
            email,
            emailVerifiedAt: new Date(),
        },
    });
    return {
        organizationId: orgId,
        accountId: account.id,
        contactId: contact.id,
    };
}

/** Someone else's booking taking a place in the session. */
async function placeTaken(serviceId: string, startAt: Date): Promise<void> {
    const who = await customer();
    await prisma.booking.create({
        data: {
            organizationId: orgId,
            serviceId,
            contactId: who.contactId,
            startAt,
            endAt: new Date(startAt.getTime() + HOUR),
            timezone: "UTC",
            status: "CONFIRMED",
            snapshot: {},
        },
    });
}

/**
 * A class of 2 with one place booked and the other held for `who` until
 * `until`: the first in line was offered the freed place.
 */
async function offered(
    who: SignedInCustomer,
    until: Date,
    over: { status?: "OFFERED" | "EXPIRED" | "CLOSED" | "LEFT" } = {},
) {
    const startAt = nextMonday();
    const serviceId = await classOf(2);
    await placeTaken(serviceId, startAt);
    const entry = await prisma.classWaitlistEntry.create({
        data: {
            organizationId: orgId,
            serviceId,
            startAt,
            endAt: new Date(startAt.getTime() + HOUR),
            contactId: who.contactId,
            customerAccountId: who.accountId,
            position: 1,
            status: over.status ?? "OFFERED",
            offeredAt: new Date(),
            offeredUntil: until,
        },
    });
    const token = signClaimToken(siteCodeSecret(), entry.id, until);
    return { entry, serviceId, startAt, token };
}

describe("the offer's email", () => {
    it("links the claim page on the business's site, for that entry and hold", async () => {
        const who = await customer();
        const until = new Date(Date.now() + 2 * HOUR);
        const { entry } = await offered(who, until);
        const subject = await runInOrgContext(orgId, () =>
            prisma.$transaction((tx) =>
                loadSubject(
                    tx,
                    orgId,
                    {
                        kind: "WAITLIST_OFFER",
                        eventKey: `waitlist:${entry.id}`,
                        waitlistEntryId: entry.id,
                    },
                    new Date(),
                ),
            ),
        );
        expect(subject?.vars.kind).toBe("WAITLIST_OFFER");
        const link =
            subject?.vars.kind === "WAITLIST_OFFER"
                ? subject.vars.waitlist.link
                : null;
        expect(link).toMatch(
            new RegExp(`^https://u18-pulse-${process.pid}\\.[^/]+/book/claim/`),
        );
        const token = decodeURIComponent(link!.split("/book/claim/")[1]);
        expect(verifyClaimToken(siteCodeSecret(), token)).toEqual({
            entryId: entry.id,
            until,
        });
        expect(renderNotice(subject!.vars).body).toContain(
            "Book your place before then:",
        );
    });
});

describe("the claim page's read", () => {
    it("shows the class and the hold, and booking it takes the place and spends the link", async () => {
        const who = await customer();
        const until = new Date(Date.now() + 2 * HOUR);
        const { entry, serviceId, startAt, token } = await offered(who, until);

        const claim = await claims.read(siteId, token, "visitor-1");
        expect(claim).toMatchObject({
            state: "open",
            business: "Pulse Fitness",
            serviceId,
            startAt: startAt.toISOString(),
            heldUntil: until.toISOString(),
            timezone: "UTC",
            // Held for them, so taken for anyone else.
            placesLeft: 0,
            rejoin: false,
        });
        expect(claim.service).toMatch(/^Spin /);

        // "Book my spot": the normal path, signed in as the person offered.
        await publicBookings.bookOnline(
            serviceId,
            {
                startAt: startAt.toISOString(),
                bookerEmail: "",
                idempotencyKey: `u18-${entry.id}`,
                pay: "DESK",
            },
            undefined,
            new Date(),
            who,
        );
        const after = await prisma.classWaitlistEntry.findUniqueOrThrow({
            where: { id: entry.id },
        });
        expect(after.status).toBe("ACCEPTED");
        expect(after.bookingId).not.toBeNull();

        const spent = await claims.read(siteId, token, "visitor-1");
        expect(spent).toMatchObject({ state: "booked", rejoin: false });
    });

    it("has ended once the hold ran out, with a way to join again", async () => {
        const who = await customer();
        const until = new Date(Date.now() - 60_000);
        const { token } = await offered(who, until);
        await expect(claims.read(siteId, token, "v")).resolves.toMatchObject({
            state: "ended",
            heldUntil: until.toISOString(),
            rejoin: true,
        });
    });

    it("has ended once the place went to the next in line", async () => {
        const who = await customer();
        const { token } = await offered(who, new Date(Date.now() + HOUR), {
            status: "EXPIRED",
        });
        await expect(claims.read(siteId, token, "v")).resolves.toMatchObject({
            state: "ended",
            rejoin: true,
        });
    });

    it("has ended for a link from an earlier hold of the same place", async () => {
        const who = await customer();
        const until = new Date(Date.now() + 2 * HOUR);
        const { entry } = await offered(who, until);
        const earlier = signClaimToken(
            siteCodeSecret(),
            entry.id,
            new Date(until.getTime() - HOUR),
        );
        await expect(claims.read(siteId, earlier, "v")).resolves.toMatchObject({
            state: "ended",
        });
    });

    it("has gone when someone else took the place while it was held", async () => {
        const who = await customer();
        const { serviceId, startAt, token } = await offered(
            who,
            new Date(Date.now() + 2 * HOUR),
        );
        // The desk booked past the hold.
        await placeTaken(serviceId, startAt);
        await expect(claims.read(siteId, token, "v")).resolves.toMatchObject({
            state: "gone",
            placesLeft: 0,
            rejoin: true,
        });
    });

    it("has gone, with no way back, when the class was cancelled", async () => {
        const who = await customer();
        const { token } = await offered(who, new Date(Date.now() + HOUR), {
            status: "CLOSED",
        });
        await expect(claims.read(siteId, token, "v")).resolves.toMatchObject({
            state: "gone",
            rejoin: false,
        });
    });

    it("is not found on another business's site", async () => {
        const who = await customer();
        const { token } = await offered(who, new Date(Date.now() + HOUR));
        await expect(
            claims.read(otherSiteId, token, "v"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("is not found for a forged or unknown link", async () => {
        const who = await customer();
        const until = new Date(Date.now() + HOUR);
        const { entry } = await offered(who, until);
        const forged = signClaimToken(
            "someone-elses-secret-at-least-32-characters",
            entry.id,
            until,
        );
        await expect(claims.read(siteId, forged, "v")).rejects.toBeInstanceOf(
            NotFoundException,
        );
        const unknown = signClaimToken(
            siteCodeSecret(),
            "clnosuchentry000000",
            until,
        );
        await expect(claims.read(siteId, unknown, "v")).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(
            claims.read("no-such-site", unknown, "v"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("limits how often one visitor reads", async () => {
        const limited = new WaitlistClaimService(
            new FixedWindowRateLimiter(1, 60_000),
        );
        const who = await customer();
        const { token } = await offered(who, new Date(Date.now() + HOUR));
        await limited.read(siteId, token, "visitor-x");
        const refused = await limited
            .read(siteId, token, "visitor-x")
            .catch((e: unknown) => e);
        expect(refused).toBeInstanceOf(HttpException);
        expect((refused as HttpException).getStatus()).toBe(429);
        // Another visitor still reads.
        await expect(
            limited.read(siteId, token, "visitor-y"),
        ).resolves.toMatchObject({ state: "open" });
    });
});
