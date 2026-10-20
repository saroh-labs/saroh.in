/**
 * Booking rules requests are told by email and in the app (DEC-170, owner
 * 19 Oct; #1038), against a real Postgres:
 *
 * - a Member's request puts a notice in the business's inbox, opening
 *   Hours and time off on them, and queues on the same transaction an
 *   email to everyone who may approve it — the owners and admins — and to
 *   nobody else; with the switch off the change applies at once and
 *   nothing is told;
 * - an approval or a turn-down tells the Member who asked, in their own
 *   alerts and by email, the reason with a turn-down;
 * - a Member reads only their own alerts: never another's, never the
 *   business's, and an owner never reads a Member's; Calendar only reads
 *   its own, a Reviewer has no bell;
 * - each email goes once, however often its job runs, and a request
 *   withdrawn before its job runs emails nobody.
 *
 * Runs in the integration project (TEST_DATABASE_URL), plain and with
 * TEST_RLS=on.
 */
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { NotificationsService } from "../notifications/notifications.service";
import type { AlertEmail } from "../notifications/team-alert.handler";
import { tellTeam } from "../notifications/team-alert.handler";
import type { TeamAlertPayload } from "../notifications/team-alerts";
import { TEAM_ALERT_TYPE } from "../notifications/team-alerts";
import {
    CALENDAR_ONLY_ACTIONS,
    CALENDAR_ONLY_ROLE_KEY,
} from "../organizations/calendar-only-role";
import { resolveCapabilities } from "../organizations/organization-policy";
import { StaffRulesService } from "./staff-rules.service";
import { StaffService } from "./staff.service";

const tag = `${process.pid}-${Date.now()}`;
const staff = new StaffService();
const rules = new StaffRulesService();
const inbox = new NotificationsService();

let orgId = "";
let owner: OrganizationContext;
let admin: OrganizationContext;
let arjunCtx: OrganizationContext;
let meeraCtx: OrganizationContext;
let calendarOnly: OrganizationContext;
let reviewer: OrganizationContext;
let arjun = "";
let kiran = "";
const email: Record<string, string> = {};

async function user(name: string) {
    const u = await prisma.user.create({
        data: { email: `alerts-${name}-${tag}@example.com`, name },
    });
    email[name] = u.email;
    return u;
}

async function member(name: string, role: string): Promise<string> {
    const u = await user(name);
    await prisma.membership.create({
        data: { organizationId: orgId, userId: u.id, role },
    });
    return u.id;
}

/** Someone on the diary, with a login in `role`. */
async function onDiary(
    name: string,
    role: string,
): Promise<{ staffId: string; userId: string }> {
    const u = await user(name);
    const membership = await prisma.membership.create({
        data: { organizationId: orgId, userId: u.id, role },
    });
    const person = await prisma.staffMember.create({
        data: { organizationId: orgId, name, membershipId: membership.id },
    });
    return { staffId: person.id, userId: u.id };
}

/** The `team.alert` jobs queued for this business, oldest first. */
async function alertJobs(): Promise<Job[]> {
    return prisma.job.findMany({
        where: { organizationId: orgId, type: TEAM_ALERT_TYPE },
        orderBy: { createdAt: "asc" },
    });
}

/** Run one queued alert as the worker does, and return who it emails. */
async function run(job: Job): Promise<AlertEmail[]> {
    const out = await runInOrgContext(orgId, () =>
        prisma.$transaction((tx) =>
            tellTeam(tx, orgId, job.payload as TeamAlertPayload),
        ),
    );
    return out.emails;
}

async function ask(changes: { gapMinutes?: number | null } = {}) {
    await rules.update(arjunCtx, arjun, {
        gapMinutes: 15,
        ...changes,
    });
    const request = await prisma.staffRuleRequest.findFirstOrThrow({
        where: { staffId: arjun, status: "WAITING" },
    });
    return request.id;
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Kaya Physio", slug: `kaya-alerts-${tag}` },
    });
    orgId = org.id;
    await prisma.businessProfile.create({
        data: { organizationId: orgId, timezone: "UTC" },
    });
    owner = {
        organizationId: orgId,
        userId: await member("Owner", "OWNER"),
        role: "OWNER",
    };
    admin = {
        organizationId: orgId,
        userId: await member("Admin", "ADMIN"),
        role: "ADMIN",
    };
    const a = await onDiary("Arjun", "MEMBER");
    arjun = a.staffId;
    arjunCtx = { organizationId: orgId, userId: a.userId, role: "MEMBER" };
    const m = await onDiary("Meera", "MEMBER");
    meeraCtx = { organizationId: orgId, userId: m.userId, role: "MEMBER" };
    const k = await onDiary("Kiran", CALENDAR_ONLY_ROLE_KEY);
    kiran = k.staffId;
    calendarOnly = {
        organizationId: orgId,
        userId: k.userId,
        role: "MEMBER",
        roleKey: CALENDAR_ONLY_ROLE_KEY,
        actions: resolveCapabilities(
            CALENDAR_ONLY_ROLE_KEY,
            CALENDAR_ONLY_ACTIONS,
        ),
    };
    reviewer = {
        organizationId: orgId,
        userId: await member("Reviewer", "REVIEWER"),
        role: "REVIEWER",
    };
});

afterEach(async () => {
    await prisma.job.deleteMany({ where: { organizationId: orgId } });
    await prisma.customerNotice.deleteMany({
        where: { organizationId: orgId },
    });
    await prisma.staffRuleRequest.deleteMany({
        where: { organizationId: orgId },
    });
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.bookingRules.deleteMany({ where: { organizationId: orgId } });
    await prisma.staffMember.updateMany({
        where: { organizationId: orgId },
        data: { gapMinutes: null, latestBookingMinutes: null },
    });
});

describe("a Member's request", () => {
    it("tells owners and admins in the inbox, opening Hours and time off on them", async () => {
        const requestId = await ask();

        const notices = await prisma.notification.findMany({
            where: { organizationId: orgId },
        });
        expect(notices).toHaveLength(1);
        expect(notices[0]).toMatchObject({
            type: "hours.rule-request",
            userId: null,
            staffId: arjun,
            title: "Arjun asked to change their booking rules",
        });
        const seen = await inbox.list(owner);
        expect(seen.map((n) => n.target)).toEqual([
            { kind: "hours", id: arjun },
        ]);
        expect((await inbox.list(admin)).map((n) => n.id)).toEqual([
            notices[0]!.id,
        ]);

        // The email is queued with the request, naming it and its notice.
        const jobs = await alertJobs();
        expect(jobs.map((j) => j.payload)).toEqual([
            {
                event: "ask",
                about: "rules",
                requestId,
                step: "asked",
                notificationId: notices[0]!.id,
            },
        ]);
    });

    it("emails every owner and admin, and nobody else, in plain words", async () => {
        await ask({ gapMinutes: 15 });
        const [job] = await alertJobs();
        const emails = await run(job!);

        expect(emails.map((e) => e.to).sort()).toEqual(
            [email.Owner, email.Admin].sort(),
        );
        const mail = emails[0]!.mail;
        expect(mail.subject).toBe(
            "Kaya Physio: Arjun asked to change their booking rules",
        );
        expect(mail.body).toBe(
            "They asked for: 15 min between bookings. Now: Gap between bookings: same as the business. Approve it or turn it down in Hours and time off.",
        );
        expect(mail.url).toMatch(
            new RegExp(`/bookings/availability\\?person=${arjun}$`),
        );
        expect(mail.cta).toBe("Review the request");
    });

    it("is emailed once, however often its job runs", async () => {
        await ask();
        const [job] = await alertJobs();
        expect(await run(job!)).toHaveLength(2);
        expect(await run(job!)).toEqual([]);
        // No second notice either: the request's own is the one.
        expect(
            await prisma.notification.count({
                where: { organizationId: orgId },
            }),
        ).toBe(1);
    });

    it("emails nobody once withdrawn before its job runs", async () => {
        const requestId = await ask();
        await rules.withdraw(arjunCtx, requestId);
        const [job] = await alertJobs();
        expect(await run(job!)).toEqual([]);
    });

    it("asked again, emails only the request waiting", async () => {
        await ask({ gapMinutes: 15 });
        await ask({ gapMinutes: 20 });
        const [first, second] = await alertJobs();
        expect(await run(first!)).toEqual([]);
        const emails = await run(second!);
        expect(emails[0]!.mail.body).toMatch(/^They asked for: 20 min/);
    });

    it("tells nobody when the switch is off and the change applies at once", async () => {
        await staff.updateBookingRules(owner, {
            memberRuleChangesNeedApproval: false,
        });
        const saved = await rules.update(arjunCtx, arjun, { gapMinutes: 15 });
        expect(saved.applied).toBe(true);
        expect(await alertJobs()).toEqual([]);
        expect(
            await prisma.notification.count({
                where: { organizationId: orgId },
            }),
        ).toBe(0);
    });

    it("can't be made by a Reviewer or Calendar only, so nothing is told", async () => {
        await expect(
            rules.update(calendarOnly, kiran, { gapMinutes: 15 }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            rules.update(reviewer, arjun, { gapMinutes: 15 }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(await alertJobs()).toEqual([]);
    });
});

describe("the answer", () => {
    it("approved, tells the Member who asked in their own alerts and by email", async () => {
        const requestId = await ask();
        await rules.approve(admin, requestId);

        const answer = await prisma.notification.findFirstOrThrow({
            where: { organizationId: orgId, type: "hours.rule-answer" },
        });
        expect(answer).toMatchObject({
            userId: arjunCtx.userId,
            staffId: arjun,
            title: "Your booking rules change was approved",
            body: "15 min between bookings",
        });

        const jobs = await alertJobs();
        expect(jobs[1]!.payload).toEqual({
            event: "ask",
            about: "rules",
            requestId,
            step: "answered",
            notificationId: answer.id,
        });
        // The request's own job, run late, asks nothing any more.
        expect(await run(jobs[0]!)).toEqual([]);
        const emails = await run(jobs[1]!);
        expect(emails.map((e) => e.to)).toEqual([email.Arjun]);
        expect(emails[0]!.mail).toMatchObject({
            subject: "Kaya Physio: Your booking rules change was approved",
            body: "Your booking rules now say: 15 min between bookings.",
            cta: "Open your hours and time off",
        });
        expect(emails[0]!.mail.url).toMatch(
            new RegExp(`/bookings/availability\\?person=${arjun}$`),
        );
        expect(await run(jobs[1]!)).toEqual([]);
    });

    it("turned down, says so with the reason, in the app and by email", async () => {
        const requestId = await ask();
        await rules.turnDown(owner, requestId, "Mornings are busy");

        const answer = await prisma.notification.findFirstOrThrow({
            where: { organizationId: orgId, type: "hours.rule-answer" },
        });
        expect(answer).toMatchObject({
            userId: arjunCtx.userId,
            title: "Your booking rules change was turned down",
            body: "15 min between bookings. Reason: Mornings are busy",
        });
        const jobs = await alertJobs();
        const emails = await run(jobs[1]!);
        expect(emails.map((e) => e.to)).toEqual([email.Arjun]);
        expect(emails[0]!.mail.body).toBe(
            "You asked for: 15 min between bookings. Nothing has changed. The reason given: “Mornings are busy”",
        );
    });

    it("turned down with no reason, says none was given", async () => {
        const requestId = await ask();
        await rules.turnDown(owner, requestId, "  ");
        const jobs = await alertJobs();
        const emails = await run(jobs[1]!);
        expect(emails[0]!.mail.body).toMatch(/No reason was given\.$/);
    });

    it.each([
        [
            "its person's rules changed directly",
            () => rules.update(owner, arjun, { latestBookingMinutes: 60 }),
            "15 min between bookings. Your booking rules were changed directly, so nothing in it was applied.",
        ],
        [
            "approval switched off",
            () =>
                staff.updateBookingRules(owner, {
                    memberRuleChangesNeedApproval: false,
                }),
            "15 min between bookings. Changes to your own rules no longer need approval, so nothing in it was applied. You can change them yourself now.",
        ],
    ] as const)(
        "replaced by a newer change (%s), tells the Member in the app and by email",
        async (_, newer, body) => {
            const requestId = await ask();
            await newer();

            const answer = await prisma.notification.findFirstOrThrow({
                where: { organizationId: orgId, type: "hours.rule-answer" },
            });
            expect(answer).toMatchObject({
                userId: arjunCtx.userId,
                staffId: arjun,
                title: "Your booking rules change was replaced by a newer change",
                body,
            });
            const jobs = await alertJobs();
            expect(jobs[1]!.payload).toMatchObject({
                requestId,
                step: "answered",
                notificationId: answer.id,
            });
            // The request's own job, run late, asks nothing any more.
            expect(await run(jobs[0]!)).toEqual([]);
            const emails = await run(jobs[1]!);
            expect(emails.map((e) => e.to)).toEqual([email.Arjun]);
            expect(emails[0]!.mail).toMatchObject({
                subject:
                    "Kaya Physio: Your booking rules change was replaced by a newer change",
                body: "You asked for: 15 min between bookings. A newer change closed it before anyone decided, so nothing in it was applied. See your booking rules as they are now, and change them again if you still need to.",
                cta: "Open your hours and time off",
            });
            // Arjun's own alerts hold it (`notification:read-own`); the
            // owner's inbox doesn't.
            expect((await inbox.list(arjunCtx)).map((n) => n.id)).toContain(
                answer.id,
            );
            expect((await inbox.list(owner)).map((n) => n.id)).not.toContain(
                answer.id,
            );
            expect(await run(jobs[1]!)).toEqual([]);
        },
    );

    it("withdrawn, tells nobody", async () => {
        const requestId = await ask();
        await rules.withdraw(arjunCtx, requestId);
        expect(await alertJobs()).toHaveLength(1);
        expect(
            await prisma.notification.count({
                where: { organizationId: orgId, type: "hours.rule-answer" },
            }),
        ).toBe(0);
    });
});

describe("whose alerts who reads", () => {
    async function answered(): Promise<{ request: string; answer: string }> {
        const requestId = await ask();
        await rules.approve(owner, requestId);
        const request = await prisma.notification.findFirstOrThrow({
            where: { organizationId: orgId, type: "hours.rule-request" },
        });
        const answer = await prisma.notification.findFirstOrThrow({
            where: { organizationId: orgId, type: "hours.rule-answer" },
        });
        return { request: request.id, answer: answer.id };
    }

    it("shows a Member only their own: never another's or the business's", async () => {
        const ids = await answered();

        const mine = await inbox.list(arjunCtx);
        expect(mine.map((n) => n.id)).toEqual([ids.answer]);
        expect(mine[0]!.target).toEqual({ kind: "hours", id: arjun });
        expect(await inbox.unreadCount(arjunCtx)).toEqual({ count: 1 });

        expect(await inbox.list(meeraCtx)).toEqual([]);
        expect(await inbox.unreadCount(meeraCtx)).toEqual({ count: 0 });
        await expect(
            inbox.markRead(meeraCtx, ids.answer),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            inbox.markRead(arjunCtx, ids.request),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("never shows an owner or admin a Member's own", async () => {
        const ids = await answered();
        expect((await inbox.list(owner)).map((n) => n.id)).toEqual([
            ids.request,
        ]);
        expect((await inbox.list(admin)).map((n) => n.id)).toEqual([
            ids.request,
        ]);
        await expect(inbox.markRead(owner, ids.answer)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        // "Mark all as read" over the business's leaves the Member's alone.
        await inbox.markAllRead(owner);
        const answer = await prisma.notification.findUniqueOrThrow({
            where: { id: ids.answer },
        });
        expect(answer.readAt).toBeNull();
    });

    it("lets a Member open their own, and mark all of theirs read, and undo it", async () => {
        const ids = await answered();
        await inbox.markRead(arjunCtx, ids.answer);
        expect(await inbox.unreadCount(arjunCtx)).toEqual({ count: 0 });

        await prisma.notification.update({
            where: { id: ids.answer },
            data: { readAt: null },
        });
        const press = await inbox.markAllRead(arjunCtx);
        expect(press.updated).toBe(1);
        // The business's request is still unread for its owners.
        const request = await prisma.notification.findUniqueOrThrow({
            where: { id: ids.request },
        });
        expect(request.readAt).toBeNull();
        expect(await inbox.undoMarkAllRead(arjunCtx, press.readAt)).toEqual({
            updated: 1,
        });
    });

    it("lets Calendar only read its own, and refuses a Reviewer, who has no bell", async () => {
        await answered();
        expect(await inbox.list(calendarOnly)).toEqual([]);
        await expect(inbox.list(reviewer)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });

    it("keeps one business's alerts from another", async () => {
        const ids = await answered();
        const other = await prisma.organization.create({
            data: { name: "Elsewhere", slug: `elsewhere-alerts-${tag}` },
        });
        await prisma.membership.create({
            data: {
                organizationId: other.id,
                userId: arjunCtx.userId,
                role: "MEMBER",
            },
        });
        const there = { ...arjunCtx, organizationId: other.id };
        expect(await inbox.list(there)).toEqual([]);
        await expect(inbox.markRead(there, ids.answer)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});
