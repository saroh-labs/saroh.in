/**
 * Saroh's own sales leads against a real Postgres (DEC-169, admin console
 * U20): an enquiry and a waitlist entry make one lead between them, the
 * first to record an email owns it, an Account manager sees only their own,
 * only Support or a Platform owner gives unowned leads out, Won names a
 * business and Lost a reason, overdue follow-ups are counted, the enquiry
 * purge takes an unconverted lead with it, and every write is on the ledger.
 *
 * Route permissions are pinned by `admin.controller.permissions.spec.ts`.
 * Runs in the integration project (TEST_DATABASE_URL), and under
 * `TEST_RLS=on`, where the migration's CHECKs and policies apply.
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { AdminAuditService } from "../admin/admin-audit.service";
import type { AdminRole } from "../admin/admin-permissions";
import { AdminRole as Roles, permissionsFor } from "../admin/admin-permissions";
import { AdminWaitlistService } from "../admin/admin-waitlist.service";
import { ContactMessagesService } from "../contact-messages/contact-messages.service";
import { deleteOldContactMessages } from "../contact-messages/contact-retention";
import { WaitlistService } from "../waitlist/waitlist.service";
import * as intake from "./lead-intake";
import { recordWebsiteLead } from "./lead-intake";
import { SarohLeadWritesService } from "./saroh-lead-writes.service";
import { SarohLeadsService } from "./saroh-leads.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;
const reads = new SarohLeadsService();
const writes = new SarohLeadWritesService(new AdminAuditService());
/** Both halves, as the controller calls them. */
const service = {
    board: reads.board.bind(reads),
    detail: reads.detail.bind(reads),
    log: reads.log.bind(reads),
    wonCandidates: reads.wonCandidates.bind(reads),
    managers: reads.managers.bind(reads),
    add: writes.add.bind(writes),
    update: writes.update.bind(writes),
    moveStage: writes.moveStage.bind(writes),
    assign: writes.assign.bind(writes),
    logContact: writes.logContact.bind(writes),
};
const contact = new ContactMessagesService();
const waitlist = new WaitlistService();

let n = 0;
/** A fresh example.com address per call, so tests never share a lead. */
const email = (label: string) => `${label}.${tag}.${(n += 1)}@example.com`;

interface Staff {
    userId: string;
    platformAdminId: string;
}

let ownerStaff: Staff;
let supportStaff: Staff;
let priya: Staff;
let rahul: Staff;
let billingStaff: Staff;

async function teammate(
    label: string,
    name: string,
    roles: AdminRole[],
): Promise<Staff> {
    const user = await prisma.user.create({
        data: { email: `${label}-${tag}@example.com`, name },
    });
    const admin = await prisma.platformAdmin.create({
        data: {
            userId: user.id,
            roleAssignments: {
                create: roles.map((role) => ({
                    role,
                    reason: "test grant",
                })),
            },
        },
    });
    return { userId: user.id, platformAdminId: admin.id };
}

const as = (staff: Staff, roles: AdminRole[]): PlatformAdminInfo => ({
    userId: staff.userId,
    platformAdminId: staff.platformAdminId,
    roles,
    permissions: permissionsFor(roles),
    viaBootstrap: false,
});

const owner = () => as(ownerStaff, [Roles.PlatformOwner]);
const support = () => as(supportStaff, [Roles.Support]);
const asPriya = () => as(priya, [Roles.AccountManager]);
const asRahul = () => as(rahul, [Roles.AccountManager]);
const billing = () => as(billingStaff, [Roles.Billing]);

async function businessOwnedBy(address: string, name: string) {
    const user = await prisma.user.create({
        data: { email: address, name: `${name} owner` },
    });
    return prisma.organization.create({
        data: {
            name,
            slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${tag}-${(n += 1)}`,
            memberships: { create: { userId: user.id, role: "OWNER" } },
        },
        select: { id: true, name: true },
    });
}

const auditRows = (targetId: string) =>
    prisma.adminAuditEvent.findMany({
        where: { targetId },
        orderBy: { createdAt: "asc" },
        select: {
            action: true,
            actorUserId: true,
            reason: true,
            metadata: true,
        },
    });

describe("Saroh's own leads (DB, U20)", () => {
    beforeAll(async () => {
        ownerStaff = await teammate("owner", "Mohit Owner", [
            Roles.PlatformOwner,
        ]);
        supportStaff = await teammate("support", "Sana Support", [
            Roles.Support,
        ]);
        priya = await teammate("priya", "Priya Sharma", [Roles.AccountManager]);
        rahul = await teammate("rahul", "Rahul Verma", [Roles.AccountManager]);
        billingStaff = await teammate("billing", "Bina Billing", [
            Roles.Billing,
        ]);
    });

    describe("from the website", () => {
        it("makes a WEBSITE lead from a question, and a waitlist entry with the same email merges into it", async () => {
            const address = email("green.leaf");
            await contact.send({
                topic: "question",
                name: "Green Leaf Gym",
                email: address,
                kind: "gym",
                message: "Can members book classes online?",
            });
            // The same person, with a +tag, on the waitlist.
            const [local, domain] = address.split("@");
            await waitlist.join({
                email: `${local}+wl@${domain}`,
                business: "Green Leaf Gym",
                kind: "gym",
                city: "Rohtak",
                source: "direct",
            });

            const leads = await prisma.sarohLead.findMany({
                where: { emailKey: address },
            });
            expect(leads).toHaveLength(1);
            expect(leads[0]).toMatchObject({
                name: "Green Leaf Gym",
                source: "WEBSITE",
                stage: "NEW",
                kind: "gym",
                city: "Rohtak",
                ownerPlatformAdminId: null,
            });
            expect(leads[0]?.websiteSeenAt).toBeInstanceOf(Date);
        });

        it("makes a WAITLIST lead from a waitlist entry, but none from a tool's email gate", async () => {
            const waiting = email("waiting");
            const tool = email("tool");
            await waitlist.join({ email: waiting, source: "direct" });
            await waitlist.join({ email: tool, source: "link-preview" });

            await expect(
                prisma.sarohLead.findUnique({ where: { emailKey: waiting } }),
            ).resolves.toMatchObject({ source: "WAITLIST" });
            await expect(
                prisma.sarohLead.findUnique({ where: { emailKey: tool } }),
            ).resolves.toBeNull();
        });

        it("makes no lead from a help or bug message", async () => {
            const address = email("helpme");
            await contact.send({
                topic: "help",
                name: "Asha Rao",
                email: address,
                message: "I can't find my invoices.",
            });
            await expect(
                prisma.sarohLead.findUnique({ where: { emailKey: address } }),
            ).resolves.toBeNull();
        });

        it("never fails the enquiry when the lead can't be written", async () => {
            const address = email("broken");
            const spy = jest
                .spyOn(intake, "recordWebsiteLead")
                .mockRejectedValueOnce(new Error("lead table unreachable"));
            await expect(
                contact.send({
                    topic: "question",
                    name: "Broken Lead",
                    email: address,
                    message: "Do you support GST invoices?",
                }),
            ).resolves.toEqual({ ok: true });
            spy.mockRestore();
            await expect(
                prisma.contactMessage.count({ where: { email: address } }),
            ).resolves.toBe(1);
        });

        it("never fails the waitlist entry when the lead can't be written", async () => {
            const address = email("broken.wl");
            const spy = jest
                .spyOn(intake, "recordWebsiteLead")
                .mockRejectedValueOnce(new Error("lead table unreachable"));
            await expect(
                waitlist.join({ email: address, source: "direct" }),
            ).resolves.toMatchObject({ created: true });
            spy.mockRestore();
        });

        it("answers failed, never throwing, when the lead table can't be reached", async () => {
            const broken = {
                findFirst: () =>
                    Promise.reject(new Error("lead table unreachable")),
            } as unknown as Parameters<
                typeof recordWebsiteLead
            >[1]["sarohLead"];
            await expect(
                recordWebsiteLead(
                    { source: "WEBSITE", email: email("down") },
                    { sarohLead: broken },
                ),
            ).resolves.toBe("failed");
        });

        it("says a merge when the email is already a lead", async () => {
            const address = email("again");
            await expect(
                recordWebsiteLead({ source: "WEBSITE", email: address }),
            ).resolves.toBe("created");
            await expect(
                recordWebsiteLead({ source: "WAITLIST", email: address }),
            ).resolves.toBe("merged");
        });
    });

    describe("adding and owning", () => {
        it("gives a manager what they add, and tells the next who owns the email", async () => {
            const address = email("royal.tailors");
            const added = await service.add(asPriya(), {
                name: "Royal Tailors",
                email: address,
                city: "Sonipat",
            });
            expect(added).toMatchObject({
                source: "ADDED",
                stage: "NEW",
                ownedHow: "ADDED",
                owner: {
                    platformAdminId: priya.platformAdminId,
                    name: "Priya Sharma",
                },
            });

            await expect(
                service.add(asRahul(), {
                    name: "Royal Tailors again",
                    email: address.toUpperCase(),
                }),
            ).rejects.toMatchObject({
                status: 409,
                message: "That email is already a lead, Priya Sharma's.",
            });
            // A sign-up email clashes the same way.
            const other = await service.add(asRahul(), { name: "Other" });
            await expect(
                service.update(asRahul(), other.id, { signUpEmail: address }),
            ).rejects.toMatchObject({ status: 409 });
        });

        it("says when the email is a website lead nobody has yet", async () => {
            const address = email("unowned");
            await recordWebsiteLead({ source: "WEBSITE", email: address });
            await expect(
                service.add(asPriya(), { name: "Mine now?", email: address }),
            ).rejects.toMatchObject({
                status: 409,
                message: expect.stringContaining("not yet given to anyone"),
            });
        });

        it("adds a lead unowned when Support adds it", async () => {
            const lead = await service.add(support(), {
                name: "Kids Art Club",
            });
            expect(lead.owner).toBeNull();
            expect(lead.ownedHow).toBeNull();
        });
    });

    describe("who sees what", () => {
        it("shows an Account manager only their own leads", async () => {
            const mine = await service.add(asPriya(), { name: "City Physio" });
            const theirs = await service.add(asRahul(), {
                name: "Spice Route",
            });
            const unowned = await service.add(support(), { name: "Free lead" });

            const board = await service.board(asPriya());
            const ids = board.leads.map((lead) => lead.id);
            expect(board.scope).toBe("own");
            expect(board.unowned).toBeNull();
            expect(board.mayAssign).toBe(false);
            expect(ids).toContain(mine.id);
            expect(ids).not.toContain(theirs.id);
            expect(ids).not.toContain(unowned.id);
            expect(
                board.leads.every(
                    (lead) =>
                        lead.owner?.platformAdminId === priya.platformAdminId,
                ),
            ).toBe(true);

            const all = await service.board(support());
            expect(all.scope).toBe("all");
            expect(all.mayAssign).toBe(true);
            expect(all.leads.map((lead) => lead.id)).toEqual(
                expect.arrayContaining([mine.id, theirs.id, unowned.id]),
            );
            const onlyUnowned = await service.board(support(), {
                owner: "unowned",
            });
            expect(onlyUnowned.leads.every((lead) => lead.owner === null)).toBe(
                true,
            );
        });

        it("refuses another manager's lead and its log with 403", async () => {
            const theirs = await service.add(asRahul(), {
                name: "Bloom Salon",
            });
            await service.logContact(asRahul(), theirs.id, {
                kind: "CALL",
                summary: "Demo booked",
            });
            await expect(
                service.detail(asPriya(), theirs.id),
            ).rejects.toBeInstanceOf(ForbiddenException);
            await expect(
                service.log(asPriya(), theirs.id),
            ).rejects.toBeInstanceOf(ForbiddenException);
            await expect(
                service.logContact(asPriya(), theirs.id, {
                    kind: "CALL",
                    summary: "Sneaky",
                }),
            ).rejects.toBeInstanceOf(ForbiddenException);
            await expect(
                service.moveStage(asPriya(), theirs.id, { stage: "TALKED" }),
            ).rejects.toBeInstanceOf(ForbiddenException);
            // An unowned lead is not theirs either.
            const unowned = await service.add(support(), { name: "Nobody's" });
            await expect(
                service.detail(asPriya(), unowned.id),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });

        it("refuses staff without the lead permissions", async () => {
            await expect(service.board(billing())).rejects.toBeInstanceOf(
                ForbiddenException,
            );
        });

        it("says 404 for a lead that doesn't exist", async () => {
            await expect(
                service.detail(support(), "no-such-lead"),
            ).rejects.toMatchObject({ status: 404 });
        });
    });

    describe("giving leads out", () => {
        it("lets Support give an unowned lead to a manager, on the ledger", async () => {
            const lead = await service.add(support(), {
                name: "Sharma Sweets",
            });
            const managers = await service.managers(support());
            expect(managers.map((m) => m.name)).toEqual(
                expect.arrayContaining(["Priya Sharma", "Rahul Verma"]),
            );
            expect(managers.map((m) => m.name)).not.toContain("Sana Support");

            const given = await service.assign(support(), lead.id, {
                platformAdminId: priya.platformAdminId,
                reason: "Priya covers Rohtak",
            });
            expect(given).toMatchObject({
                ownedHow: "ASSIGNED",
                owner: { platformAdminId: priya.platformAdminId },
            });
            await expect(
                service.detail(asPriya(), lead.id),
            ).resolves.toMatchObject({ id: lead.id, mayAssign: false });

            // Owned now: it stays Priya's.
            await expect(
                service.assign(owner(), lead.id, {
                    platformAdminId: rahul.platformAdminId,
                    reason: "Move it",
                }),
            ).rejects.toMatchObject({ status: 409 });

            const rows = await auditRows(lead.id);
            expect(rows.map((row) => row.action)).toEqual([
                "saroh-lead.added",
                "saroh-lead.assigned",
            ]);
            expect(rows[1]).toMatchObject({
                actorUserId: supportStaff.userId,
                reason: "Priya covers Rohtak",
                metadata: { ownerPlatformAdminId: priya.platformAdminId },
            });
        });

        it("never lets a manager claim a lead, or give one out", async () => {
            const lead = await service.add(support(), { name: "Up for grabs" });
            await expect(
                service.assign(asPriya(), lead.id, {
                    platformAdminId: priya.platformAdminId,
                    reason: "I want it",
                }),
            ).rejects.toBeInstanceOf(ForbiddenException);
            await expect(service.managers(asPriya())).rejects.toBeInstanceOf(
                ForbiddenException,
            );
        });

        it("gives leads only to someone who is an Account manager now", async () => {
            const lead = await service.add(support(), { name: "For Sana?" });
            await expect(
                service.assign(support(), lead.id, {
                    platformAdminId: supportStaff.platformAdminId,
                    reason: "Wrong person",
                }),
            ).rejects.toMatchObject({ status: 400 });
        });
    });

    describe("stages", () => {
        it("needs a business for Won and a reason for Lost", async () => {
            const address = email("leafy");
            const lead = await service.add(asPriya(), {
                name: "Leafy Cafe",
                email: address,
            });
            await expect(
                service.moveStage(asPriya(), lead.id, { stage: "WON" }),
            ).rejects.toMatchObject({
                status: 400,
                message: "Won needs the business this lead became.",
            });
            await expect(
                service.moveStage(asPriya(), lead.id, { stage: "LOST" }),
            ).rejects.toMatchObject({
                status: 400,
                message: "Lost needs a reason.",
            });

            await expect(
                service.moveStage(asPriya(), lead.id, { stage: "TALKED" }),
            ).resolves.toMatchObject({ stage: "TALKED" });

            // A manager can name only the business their lead's email owns.
            const unrelated = await businessOwnedBy(
                email("stranger"),
                "Stranger Co",
            );
            await expect(
                service.moveStage(asPriya(), lead.id, {
                    stage: "WON",
                    organizationId: unrelated.id,
                }),
            ).rejects.toMatchObject({ status: 400 });

            const business = await businessOwnedBy(address, "Leafy Cafe");
            await expect(
                service.wonCandidates(asPriya(), lead.id),
            ).resolves.toEqual([business]);
            await expect(
                service.moveStage(asPriya(), lead.id, {
                    stage: "WON",
                    organizationId: business.id,
                }),
            ).resolves.toMatchObject({ stage: "WON" });
            await expect(
                service.detail(asPriya(), lead.id),
            ).resolves.toMatchObject({ wonOrganization: business });

            const other = await service.add(asPriya(), { name: "Gone cold" });
            await expect(
                service.moveStage(asPriya(), other.id, {
                    stage: "LOST",
                    lostReason: "Went with a spreadsheet",
                }),
            ).resolves.toMatchObject({ stage: "LOST" });

            const rows = await auditRows(lead.id);
            expect(rows.map((row) => row.metadata)).toEqual(
                expect.arrayContaining([
                    { from: "NEW", to: "TALKED" },
                    { from: "TALKED", to: "WON" },
                ]),
            );
            // No email anywhere in the ledger's metadata.
            expect(JSON.stringify(rows)).not.toContain(address);
        });
    });

    describe("follow-ups and the log", () => {
        it("counts open leads whose follow-up day has passed", async () => {
            const before = (await service.board(asRahul())).overdue;
            const late = await service.add(asRahul(), {
                name: "Late one",
                followUpOn: "2020-01-01",
            });
            await service.add(asRahul(), {
                name: "Later one",
                followUpOn: "2999-01-01",
            });
            const closed = await service.add(asRahul(), {
                name: "Closed late",
                followUpOn: "2020-01-01",
            });
            await service.moveStage(asRahul(), closed.id, {
                stage: "LOST",
                lostReason: "No budget",
            });

            const board = await service.board(asRahul());
            expect(board.overdue).toBe(before + 1);
            expect(board.leads.find((l) => l.id === late.id)?.overdue).toBe(
                true,
            );
            expect(board.leads.find((l) => l.id === closed.id)?.overdue).toBe(
                false,
            );
        });

        it("logs a call with feedback and moves the follow-up", async () => {
            const lead = await service.add(asPriya(), { name: "Asha Yoga" });
            const entry = await service.logContact(asPriya(), lead.id, {
                kind: "CALL",
                summary: "Talked through classes and packs",
                feedback: "Wants WhatsApp reminders",
                minutes: 20,
                followUpOn: "2999-02-03",
            });
            expect(entry).toMatchObject({
                kind: "CALL",
                minutes: 20,
                feedback: "Wants WhatsApp reminders",
                by: "Priya Sharma",
            });
            const detail = await service.detail(asPriya(), lead.id);
            expect(detail.followUpOn).toBe("2999-02-03");
            expect(detail.log).toHaveLength(1);
            expect(detail.lastContactAt).toEqual(entry.happenedAt);
            await expect(auditRows(lead.id)).resolves.toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        action: "saroh-lead.contact-logged",
                    }),
                ]),
            );
        });

        it("refuses a call logged in the future", async () => {
            const lead = await service.add(asPriya(), {
                name: "Time traveller",
            });
            await expect(
                service.logContact(asPriya(), lead.id, {
                    kind: "VISIT",
                    summary: "Not yet",
                    happenedAt: new Date(Date.now() + DAY_MS).toISOString(),
                }),
            ).rejects.toMatchObject({ status: 400 });
        });
    });

    describe("retention", () => {
        it("deletes an unconverted website lead with its old enquiry, and keeps the rest", async () => {
            const old = new Date(Date.now() - 400 * DAY_MS);
            const stale = email("stale");
            const waiting = email("still.waiting");
            const added = email("added");
            const won = email("won");

            await prisma.contactMessage.create({
                data: {
                    topic: "question",
                    name: "Stale",
                    email: stale,
                    message: "Old question",
                    createdAt: old,
                },
            });
            await recordWebsiteLead({
                source: "WEBSITE",
                email: stale,
                now: old,
            });
            // A waitlist entry still holds this one.
            await recordWebsiteLead({
                source: "WAITLIST",
                email: waiting,
                now: old,
            });
            await prisma.waitlistSignup.create({
                data: { email: waiting, emailKey: waiting },
            });
            // A manager's own lead is never purged here.
            await service.add(asPriya(), { name: "Added", email: added });
            await prisma.sarohLead.update({
                where: { emailKey: added },
                data: { websiteSeenAt: old },
            });
            // A lead that became a business stays.
            await recordWebsiteLead({
                source: "WEBSITE",
                email: won,
                now: old,
            });
            const business = await businessOwnedBy(email("wonbiz"), "Won Biz");
            await prisma.sarohLead.update({
                where: { emailKey: won },
                data: {
                    stage: "WON",
                    wonOrganizationId: business.id,
                    wonAt: old,
                },
            });
            const staleLead = await prisma.sarohLead.findUniqueOrThrow({
                where: { emailKey: stale },
            });
            await prisma.sarohContactLog.create({
                data: {
                    leadId: staleLead.id,
                    actorUserId: priya.userId,
                    kind: "CALL",
                    happenedAt: old,
                    summary: "No answer",
                },
            });

            await deleteOldContactMessages(new Date());

            const left = await prisma.sarohLead.findMany({
                where: { emailKey: { in: [stale, waiting, added, won] } },
                select: { emailKey: true },
            });
            expect(left.map((row) => row.emailKey).sort()).toEqual(
                [waiting, added, won].sort(),
            );
            await expect(
                prisma.contactMessage.count({ where: { email: stale } }),
            ).resolves.toBe(0);
            await expect(
                prisma.sarohContactLog.count({
                    where: { leadId: staleLead.id },
                }),
            ).resolves.toBe(0);
        });

        it("takes the lead off with a waitlist entry its owner asked to remove", async () => {
            const address = email("remove.me");
            await waitlist.join({ email: address, source: "direct" });
            const entry = await prisma.waitlistSignup.findFirstOrThrow({
                where: { emailKey: address },
            });
            const admin = new AdminWaitlistService(
                new AdminAuditService(),
                {} as never,
            );
            await admin.remove(support(), entry.id, "They asked to be removed");
            await expect(
                prisma.sarohLead.findUnique({ where: { emailKey: address } }),
            ).resolves.toBeNull();
        });
    });

    it("shows an empty board to a manager with no leads", async () => {
        const fresh = await teammate("fresh", "Fresh Face", [
            Roles.AccountManager,
        ]);
        const board = await service.board(as(fresh, [Roles.AccountManager]));
        expect(board).toMatchObject({
            leads: [],
            overdue: 0,
            counts: { NEW: 0, TALKED: 0, DEMO: 0, TRIAL: 0, WON: 0, LOST: 0 },
        });
    });
});
