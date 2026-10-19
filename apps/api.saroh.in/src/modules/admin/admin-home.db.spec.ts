/**
 * Home's "Needs you" and counts (admin console redesign U10, R14) against a
 * real Postgres:
 *
 * - each kind (billing, reports, help, stuck sign-ups, failed jobs) is
 *   counted, with its oldest or newest date;
 * - a kind is in the answer only for staff whose permissions reach its fix;
 * - a sign-up is stuck only after a day, and a help message or a failed job
 *   counts for a week;
 * - with nothing waiting, `needs` is empty: the all-clear.
 *
 * Counts only: the answer carries no name, email or message. Integration
 * project (TEST_DATABASE_URL), plain and `TEST_RLS=on`. The setup empties
 * every table after each file, so the counts here are this file's own.
 */
import { prisma } from "@saroh/database";

import { AdminHomeService } from "./admin-home.service";
import type { AdminRole } from "./admin-permissions";
import { AdminRole as Roles, permissionsFor } from "./admin-permissions";

const tag = `${process.pid}-${Date.now()}`;
const service = new AdminHomeService();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = new Date();

const as = (roles: AdminRole[]) => ({ permissions: permissionsFor(roles) });

let reportId = "";
let actionId = "";

beforeAll(async () => {
    const business = await prisma.organization.create({
        data: { name: "Home spec", slug: `home-spec-${tag}` },
    });
    const owner = await prisma.user.create({
        data: { email: `owner-${tag}@example.com`, emailVerified: true },
    });
    await prisma.membership.create({
        data: { organizationId: business.id, userId: owner.id, role: "OWNER" },
    });
    reportId = (
        await prisma.businessReport.create({
            data: {
                organizationId: business.id,
                siteHost: "home-spec.example.com",
                message: "Spam on the page",
                createdAt: new Date(now.getTime() - 2 * HOUR),
            },
        })
    ).id;
    actionId = (
        await prisma.billingAction.create({
            data: {
                organizationId: business.id,
                code: "billing_double_charge_refund_given_up",
                refs: {},
                note: "A refund the provider refused.",
                createdAt: new Date(now.getTime() - 3 * HOUR),
            },
        })
    ).id;
    await prisma.contactMessage.createMany({
        data: [
            {
                topic: "help",
                name: "Ravi",
                email: `ravi-${tag}@example.com`,
                message: "Bookings are missing",
                createdAt: new Date(now.getTime() - HOUR),
            },
            // Older than a week, and another topic: neither counts.
            {
                topic: "help",
                name: "Old",
                email: `old-${tag}@example.com`,
                message: "Long ago",
                createdAt: new Date(now.getTime() - 9 * DAY),
            },
            {
                topic: "question",
                name: "Q",
                email: `q-${tag}@example.com`,
                message: "A question",
            },
        ],
    });
    await prisma.user.createMany({
        data: [
            // Stuck: two days, unverified, no business.
            {
                email: `stuck-${tag}@example.com`,
                createdAt: new Date(now.getTime() - 2 * DAY),
            },
            // Not yet: joined an hour ago.
            {
                email: `fresh-${tag}@example.com`,
                createdAt: new Date(now.getTime() - HOUR),
            },
            // Verified: not stuck, though it has no business.
            {
                email: `verified-${tag}@example.com`,
                emailVerified: true,
                createdAt: new Date(now.getTime() - 2 * DAY),
            },
        ],
    });
    await prisma.job.createMany({
        data: [
            {
                type: "billing.profile.sync",
                payload: {},
                status: "FAILED",
                processedAt: new Date(now.getTime() - 2 * HOUR),
            },
            // A week and more ago: not on Home.
            {
                type: "billing.profile.sync",
                payload: {},
                status: "FAILED",
                processedAt: new Date(now.getTime() - 8 * DAY),
            },
        ],
    });
});

describe("Home (DB, U10)", () => {
    it("lists every kind that is waiting, for a Platform owner", async () => {
        const home = await service.home(as([Roles.PlatformOwner]), now);

        expect(home.checked).toEqual([
            "billing",
            "reports",
            "help",
            "sign-ups",
            "jobs",
        ]);
        expect(home.needs.map((n) => [n.kind, n.count])).toEqual([
            ["billing", 1],
            ["reports", 1],
            ["help", 1],
            ["sign-ups", 1],
            ["jobs", 1],
        ]);
        expect(home.needs.every((n) => n.at !== null)).toBe(true);
        expect(home.counts).toEqual({
            businesses: 1,
            businessesThisWeek: 1,
            // The three people above with no business.
            noBusinessYet: 3,
            paying: 0,
            jobsFailedToday: 1,
        });
        // Counts and dates only.
        expect(JSON.stringify(home)).not.toContain("@example.com");
    });

    it("shows only what each person's permissions reach", async () => {
        const release = await service.home(as([Roles.ReleaseManager]), now);
        expect(release.checked).toEqual(["reports"]);
        expect(release.needs.map((n) => n.kind)).toEqual(["reports"]);
        expect(release.counts.paying).toBeNull();
        expect(release.counts.jobsFailedToday).toBeNull();

        const billing = await service.home(as([Roles.Billing]), now);
        expect(billing.checked).toEqual(["billing", "reports"]);

        const support = await service.home(as([Roles.Support]), now);
        expect(support.checked).toEqual(["reports", "help", "sign-ups"]);

        const operations = await service.home(as([Roles.Operations]), now);
        expect(operations.checked).toEqual(["reports", "jobs"]);
        expect(operations.counts.jobsFailedToday).toBe(1);
    });

    it("is the all-clear once nothing is waiting", async () => {
        await prisma.businessReport.update({
            where: { id: reportId },
            data: { status: "DONE", doneAt: now },
        });
        await prisma.billingAction.update({
            where: { id: actionId },
            data: { resolvedAt: now },
        });
        // A month on: the help message, the stuck sign-up and the failed
        // job have all aged off Home.
        const later = new Date(now.getTime() + 31 * DAY);

        const home = await service.home(as([Roles.PlatformOwner]), later);
        expect(home.needs).toEqual([]);
        expect(home.checked).toHaveLength(5);
    });
});
