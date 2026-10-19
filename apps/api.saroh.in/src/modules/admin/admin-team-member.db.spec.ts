/**
 * A teammate's page (DEC-169, admin console U22, R33) against a real
 * Postgres:
 *
 * - `team:read` (Support, Billing) opens anyone's page; an Account manager
 *   opens only their own, and another's (or an id that names nobody) is a
 *   403 before anything is read.
 * - Businesses are the open manager links, each with how it came in; an
 *   ended one is only in Activity.
 * - Leads, and what a call said, are for the teammate themself and for
 *   Support and Platform owner; Billing sees counts and when, never a
 *   lead's name or a call's words.
 * - Log a call with a business (`SarohBusinessContactsService`): an
 *   Account manager only with their own; it lands on their Activity.
 *
 * Integration project (TEST_DATABASE_URL), plain and `TEST_RLS=on`.
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { SarohBusinessContactsService } from "../saroh-leads/business-contacts.service";
import { AdminAuditService } from "./admin-audit.service";
import type { AdminRole } from "./admin-permissions";
import { AdminRole as Roles, permissionsFor } from "./admin-permissions";
import { AdminStaffService } from "./admin-staff.service";
import { istMonthStart } from "./admin-team-member";
import { generateManagerCode } from "./staff-profile";

const DAY_MS = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => (seq += 1);

const audit = new AdminAuditService();
const staffService = new AdminStaffService(audit);
const contacts = new SarohBusinessContactsService(audit);

interface Staff {
    userId: string;
    platformAdminId: string;
    roles: AdminRole[];
}

async function teammate(name: string, roles: AdminRole[]): Promise<Staff> {
    const user = await prisma.user.create({
        data: { email: `member-${next()}-${tag}@example.com`, name },
    });
    const admin = await prisma.platformAdmin.create({
        data: {
            userId: user.id,
            roleAssignments: {
                create: roles.map((role) => ({ role, reason: "test grant" })),
            },
        },
    });
    return { userId: user.id, platformAdminId: admin.id, roles };
}

const as = (staff: Staff): PlatformAdminInfo => ({
    userId: staff.userId,
    platformAdminId: staff.platformAdminId,
    roles: staff.roles,
    permissions: permissionsFor(staff.roles),
    viaBootstrap: false,
});

async function business(name: string): Promise<string> {
    const org = await prisma.organization.create({
        data: {
            name,
            slug: `adm-member-${next()}-${tag}`,
            lifecycleStatus: "ACTIVE",
        },
    });
    return org.id;
}

async function link(
    organizationId: string,
    platformAdminId: string,
    source: "LINK" | "CODE" | "LEAD_EMAIL" | "ASSIGNED",
    endedAt: Date | null = null,
) {
    await prisma.accountManagerLink.create({
        data: {
            organizationId,
            platformAdminId,
            source,
            kind: source === "ASSIGNED" ? "ASSIGNED" : "BROUGHT_IN",
            startedAt: new Date(Date.now() - 10 * DAY_MS),
        },
    });
    if (endedAt) {
        await prisma.accountManagerLink.updateMany({
            where: { organizationId, platformAdminId, endedAt: null },
            data: { endedAt, endedReason: "test move" },
        });
    }
}

let owner: Staff;
let support: Staff;
let billing: Staff;
let asha: Staff;
let ravi: Staff;
let leafy: string;
let bloom: string;
let spice: string;
let raviShop: string;
let leadId: string;

beforeAll(async () => {
    owner = await teammate("Meera Owner", [Roles.PlatformOwner]);
    support = await teammate("Sana Support", [Roles.Support]);
    billing = await teammate("Bina Billing", [Roles.Billing]);
    asha = await teammate("Asha Manager", [Roles.AccountManager]);
    ravi = await teammate("Ravi Manager", [Roles.AccountManager]);
    await prisma.staffProfile.create({
        data: {
            platformAdminId: asha.platformAdminId,
            worksAs: "ACCOUNT_MANAGER_JOB",
            managerCode: generateManagerCode(),
            phone: "+91 90000 00001",
            reportsToPlatformAdminId: owner.platformAdminId,
        },
    });

    leafy = await business("Leafy Member Cafe");
    bloom = await business("Bloom Member Salon");
    spice = await business("Spice Member Kitchen");
    raviShop = await business("Ravi Member Shop");
    await link(leafy, asha.platformAdminId, "LINK");
    await link(bloom, asha.platformAdminId, "ASSIGNED");
    await link(spice, asha.platformAdminId, "CODE", new Date());
    await link(raviShop, ravi.platformAdminId, "ASSIGNED");

    const lead = await prisma.sarohLead.create({
        data: {
            name: "Green Member Gym",
            source: "ADDED",
            stage: "TALKED",
            ownerPlatformAdminId: asha.platformAdminId,
            ownerSince: new Date(),
            ownedHow: "ADDED",
            followUpOn: new Date(Date.now() - 3 * DAY_MS),
        },
    });
    leadId = lead.id;
    await prisma.sarohLead.create({
        data: {
            name: "Won Member Studio",
            source: "ADDED",
            stage: "WON",
            ownerPlatformAdminId: asha.platformAdminId,
            wonOrganizationId: leafy,
            wonAt: new Date(),
        },
    });
    await prisma.sarohContactLog.create({
        data: {
            leadId,
            platformAdminId: asha.platformAdminId,
            actorUserId: asha.userId,
            kind: "CALL",
            happenedAt: new Date(Date.now() - DAY_MS),
            minutes: 12,
            summary: "Talked about bookings",
        },
    });
});

describe("A teammate's page (DB, U22)", () => {
    it("opens anyone's page to team:read, with businesses and how each came in", async () => {
        const page = await staffService.member({
            staff: as(support),
            platformAdminId: asha.platformAdminId,
        });
        expect(page.self).toBe(false);
        expect(page.name).toBe("Asha Manager");
        expect(page.roles.map((role) => role.role)).toEqual([
            Roles.AccountManager,
        ]);
        expect(page.reportsTo).toEqual({
            platformAdminId: owner.platformAdminId,
            name: "Meera Owner",
        });
        expect(page.profile.exists).toBe(true);
        expect(page.profile.phone).toBe("+91 90000 00001");
        expect(page.profile.managerCode).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);

        const came = Object.fromEntries(
            page.businesses.map((b) => [b.organizationId, [b.source, b.kind]]),
        );
        expect(came).toEqual({
            [leafy]: ["LINK", "BROUGHT_IN"],
            [bloom]: ["ASSIGNED", "ASSIGNED"],
        });
        expect(page.counts).toMatchObject({
            businesses: 2,
            broughtIn: 1,
            openLeads: 1,
            overdueFollowUps: 1,
            wonThisMonth: 1,
        });

        // The ended link is history: in Activity, not in Businesses.
        const types = page.activity.map((entry) => entry.type);
        expect(types).toEqual(
            expect.arrayContaining([
                "contact",
                "role-given",
                "business-started",
                "business-ended",
            ]),
        );
        const ended = page.activity.find((e) => e.type === "business-ended");
        expect(ended).toMatchObject({ organizationId: spice, source: "CODE" });
    });

    it("shows Support the leads and what each call said", async () => {
        const page = await staffService.member({
            staff: as(support),
            platformAdminId: asha.platformAdminId,
        });
        expect(page.leads?.map((lead) => lead.name)).toEqual([
            "Green Member Gym",
        ]);
        const call = page.activity.find((e) => e.type === "contact");
        expect(call).toMatchObject({
            summary: "Talked about bookings",
            with: { type: "lead", id: leadId, name: "Green Member Gym" },
        });
    });

    it("shows Billing counts and when, never a lead's name or a call's words", async () => {
        const page = await staffService.member({
            staff: as(billing),
            platformAdminId: asha.platformAdminId,
        });
        expect(page.leads).toBeNull();
        expect(page.counts.openLeads).toBe(1);
        const call = page.activity.find((e) => e.type === "contact");
        expect(call).toMatchObject({
            summary: null,
            with: { type: "lead", id: leadId, name: null },
        });
        // `team:pay`: the tax id's last 4 are part of the read (none set).
        expect(page.profile.taxIdLast4).toBeNull();
    });

    it("leaves the tax id's last 4 out for staff without team:pay", async () => {
        const page = await staffService.member({
            staff: as(support),
            platformAdminId: asha.platformAdminId,
        });
        expect("taxIdLast4" in page.profile).toBe(false);
    });

    it("opens an Account manager's own page to them", async () => {
        const page = await staffService.member({
            staff: as(asha),
            platformAdminId: asha.platformAdminId,
        });
        expect(page.self).toBe(true);
        expect(page.leads?.map((lead) => lead.name)).toEqual([
            "Green Member Gym",
        ]);
        expect(page.businesses).toHaveLength(2);
    });

    it("refuses an Account manager another's page, and an id that names nobody", async () => {
        await expect(
            staffService.member({
                staff: as(asha),
                platformAdminId: ravi.platformAdminId,
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            staffService.member({
                staff: as(asha),
                platformAdminId: "nobody-at-all",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("counts this month's wins from the first of the month in India", () => {
        // 19 Oct 2026, 20:00 UTC is 20 Oct in India: the month began
        // 1 Oct 00:00 IST, which is 30 Sep 18:30 UTC.
        expect(
            istMonthStart(new Date("2026-10-19T20:00:00.000Z")).toISOString(),
        ).toBe("2026-09-30T18:30:00.000Z");
    });
});

describe("Log a call with a business (DB, U22)", () => {
    it("lets an Account manager log with their own business, onto their Activity", async () => {
        const logged = await contacts.log(as(asha), bloom, {
            kind: "VISIT",
            summary: "Showed the booking page",
            minutes: 20,
        });
        expect(logged).toMatchObject({
            kind: "VISIT",
            summary: "Showed the booking page",
            by: "Asha Manager",
        });

        const page = await staffService.member({
            staff: as(asha),
            platformAdminId: asha.platformAdminId,
        });
        expect(page.activity[0]).toMatchObject({
            type: "contact",
            kind: "VISIT",
            summary: "Showed the booking page",
            with: { type: "business", id: bloom, name: "Bloom Member Salon" },
        });

        const row = await prisma.adminAuditEvent.findFirst({
            where: {
                action: "business.contact-logged",
                targetId: bloom,
                actorUserId: asha.userId,
            },
            select: { metadata: true, organizationId: true },
        });
        expect(row?.organizationId).toBe(bloom);
        expect(JSON.stringify(row?.metadata)).not.toContain("booking page");
    });

    it("refuses an Account manager a business that isn't theirs", async () => {
        await expect(
            contacts.log(as(asha), raviShop, {
                kind: "CALL",
                summary: "Not mine",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        // An ended link grants nothing either.
        await expect(
            contacts.log(as(asha), spice, { kind: "CALL", summary: "Gone" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("lets Support log with any business", async () => {
        const logged = await contacts.log(as(support), raviShop, {
            kind: "CALL",
            summary: "Checked in for Ravi",
        });
        expect(logged.by).toBe("Sana Support");
    });

    it("refuses Billing, who holds no saroh-leads:write", async () => {
        await expect(
            contacts.log(as(billing), leafy, { kind: "CALL", summary: "No" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
