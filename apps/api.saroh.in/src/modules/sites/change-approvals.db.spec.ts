/**
 * Per-change approval (DEC-226, website area U9) against a real Postgres:
 * a reviewer approves a teammate's change and it goes out; a later edit
 * voids the approval; nobody approves their own change; with "Publishing
 * needs approval" off, or on a plan without it, nothing waits.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { planMeter } from "../billing/metering.service";
import type { OrgAction } from "../organizations/organization-actions";
import { SitesService } from "./sites.service";

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

const hero = (key: string, heading: string) => ({
    key,
    type: "hero",
    contractVersion: 1,
    content: { heading },
});

async function person(
    organizationId: string,
    name: string,
    role: string,
): Promise<string> {
    const user = await prisma.user.create({
        data: { email: `${uniq("ca-")}@example.com`, name },
    });
    await prisma.membership.create({
        data: { organizationId, userId: user.id, role },
    });
    return user.id;
}

/**
 * A live site with "Publishing needs approval" on: Mohit (owner), Asha
 * (admin), Ritika (a teammate who edits) and Kavya (the site's reviewer).
 */
async function business(opts: { approval?: boolean } = {}) {
    const org = await prisma.organization.create({
        data: { name: "Gulmohar Studio", slug: uniq("ca-org-") },
    });
    const mohit = await person(org.id, "Mohit", "OWNER");
    const asha = await person(org.id, "Asha", "ADMIN");
    const ritika = await person(org.id, "Ritika", "MEMBER");
    const kavya = await person(org.id, "Kavya", "REVIEWER");
    const ctx = (
        userId: string,
        role: OrganizationContext["role"],
        actions?: OrgAction[],
    ): OrganizationContext => ({
        organizationId: org.id,
        userId,
        role,
        roleKey: role,
        ...(actions ? { actions: new Set(actions) } : {}),
    });
    const owner = ctx(mohit, "OWNER");
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Gulmohar",
            slug: uniq("ca-site-"),
            subdomain: uniq("casub"),
        },
    });
    await prisma.siteReviewer.create({
        data: { organizationId: org.id, siteId: site.id, userId: kavya },
    });
    const bridal = await prisma.page.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            path: "/",
            title: "Bridal packages",
            isHome: true,
        },
    });
    await sites.replaceDraftSections(owner, site.id, bridal.id, {
        sections: [hero("k1", "Intro"), hero("k2", "Packages")],
    });
    await sites.publishSite(owner, site.id);
    if (opts.approval !== false) {
        await prisma.site.update({
            where: { id: site.id },
            data: { publishNeedsApproval: true },
        });
    }
    return {
        org,
        site,
        bridal,
        owner,
        admin: ctx(asha, "ADMIN"),
        // A teammate who may edit the site, and no more.
        ritika: ctx(ritika, "MEMBER", [
            "site:read",
            "site:update",
            "section:write",
        ]),
        reviewer: ctx(kavya, "REVIEWER"),
        k1: `section:${bridal.id}:k1`,
        k2: `section:${bridal.id}:k2`,
    };
}

async function liveHeadings(siteId: string): Promise<string[]> {
    const row = await prisma.site.findUniqueOrThrow({
        where: { id: siteId },
        select: { currentPublication: { select: { snapshot: true } } },
    });
    const snap = row.currentPublication?.snapshot as {
        pages: { sections: { content: { heading: string } }[] }[];
    };
    return snap.pages[0].sections.map((s) => s.content.heading);
}

describe("per-change approval (U9)", () => {
    beforeEach(() => {
        jest.spyOn(planMeter, "isIncluded").mockResolvedValue(true);
    });
    afterEach(() => jest.restoreAllMocks());

    it("publishes the approved change; the teammate's waiting one stays in the draft", async () => {
        const b = await business();
        await sites.replaceDraftSections(b.ritika, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Intro, new"), hero("k2", "Packages, new")],
        });
        await sites.recordChangeVerdict(b.reviewer, b.site.id, {
            units: [b.k1],
            outcome: "APPROVED",
        });

        const changes = await sites.getChanges(b.owner, b.site.id);
        expect(changes.approvalRequired).toBe(true);
        const k1 = changes.units.find((u) => u.key === b.k1)!;
        expect(k1.approval).toMatchObject({
            state: "approved",
            by: { name: "Kavya" },
        });
        expect(k1.approval.approvers.map((a) => a.name)).not.toContain(
            "Ritika",
        );

        const result = await sites.publishSite(b.owner, b.site.id);
        expect(result.overridden).toBe(false);
        expect(result.alsoLeftOut).toEqual([b.k2]);
        expect(await liveHeadings(b.site.id)).toEqual([
            "Intro, new",
            "Packages",
        ]);

        const after = await sites.getChanges(b.owner, b.site.id);
        expect(after.units.map((u) => u.key)).toEqual([b.k2]);
        expect(after.units[0].approval.state).toBe("waiting");
    });

    it("a later edit voids the approval, recorded once by the publish", async () => {
        const b = await business();
        await sites.replaceDraftSections(b.ritika, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Intro, new"), hero("k2", "Packages")],
        });
        await sites.recordChangeVerdict(b.reviewer, b.site.id, {
            units: [b.k1],
            outcome: "APPROVED",
        });
        await sites.replaceDraftSections(b.ritika, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Intro, newer"), hero("k2", "Packages")],
        });

        const changes = await sites.getChanges(b.owner, b.site.id);
        expect(changes.units[0].approval).toMatchObject({
            state: "waiting",
            voided: true,
        });
        // Nothing else to go out: refused, naming the change.
        await expect(
            sites.publishSite(b.owner, b.site.id),
        ).rejects.toMatchObject({
            status: 409,
            response: { details: { code: "APPROVAL_REQUIRED", units: [b.k1] } },
        });
    });

    it("records a voided approval when a publish passes it by", async () => {
        const b = await business();
        await sites.replaceDraftSections(b.ritika, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Intro, new"), hero("k2", "Packages")],
        });
        await sites.recordChangeVerdict(b.reviewer, b.site.id, {
            units: [b.k1],
            outcome: "APPROVED",
        });
        await sites.replaceDraftSections(b.ritika, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Intro, newer"), hero("k2", "Packages")],
        });
        // The owner's own change goes out; Ritika's voided one stays.
        await sites.replaceDraftSections(b.owner, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Intro, newer"), hero("k2", "Packages, new")],
        });

        await sites.publishSite(b.owner, b.site.id);
        expect(await liveHeadings(b.site.id)).toEqual([
            "Intro",
            "Packages, new",
        ]);
        const voided = await prisma.siteChangeApproval.count({
            where: { siteId: b.site.id, unitKey: b.k1, outcome: "VOIDED" },
        });
        expect(voided).toBe(1);
        const audit = await prisma.auditEvent.count({
            where: {
                organizationId: b.org.id,
                action: "site.change_approval.voided",
            },
        });
        expect(audit).toBe(1);
    });

    it("nobody approves a change they made last (403)", async () => {
        const b = await business();
        await sites.replaceDraftSections(b.admin, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Intro, Asha's"), hero("k2", "Packages")],
        });
        await expect(
            sites.recordChangeVerdict(b.admin, b.site.id, {
                units: [b.k1],
                outcome: "APPROVED",
            }),
        ).rejects.toMatchObject({ status: 403 });
    });

    it("asking for changes keeps the reason and tells the editor", async () => {
        const b = await business();
        await sites.replaceDraftSections(b.ritika, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Intro, new"), hero("k2", "Packages")],
        });
        await sites.recordChangeVerdict(b.reviewer, b.site.id, {
            units: [b.k1],
            outcome: "CHANGES_REQUESTED",
            reason: "Last season's prices",
        });
        const changes = await sites.getChanges(b.owner, b.site.id);
        expect(changes.units[0].approval).toMatchObject({
            state: "asked",
            reason: "Last season's prices",
        });
        const jobs = await prisma.job.findMany({
            where: { organizationId: b.org.id, type: "team.alert" },
            select: { payload: true },
        });
        expect(jobs.map((j) => j.payload)).toContainEqual(
            expect.objectContaining({
                about: "change",
                editorUserId: b.ritika.userId,
            }),
        );
    });

    it("an owner's override takes everything, recorded as OVERRIDDEN", async () => {
        const b = await business();
        await sites.replaceDraftSections(b.ritika, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Intro, new"), hero("k2", "Packages")],
        });
        const result = await sites.publishSite(b.owner, b.site.id, {
            override: true,
        });
        expect(result.overridden).toBe(true);
        expect(result.route).toBe("OVERRIDDEN");
        expect(await liveHeadings(b.site.id)).toEqual([
            "Intro, new",
            "Packages",
        ]);
    });

    it("with the switch off, nothing waits", async () => {
        const b = await business({ approval: false });
        await sites.replaceDraftSections(b.ritika, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Intro, new"), hero("k2", "Packages")],
        });
        expect(
            (await sites.getChanges(b.owner, b.site.id)).approvalRequired,
        ).toBe(false);
        const result = await sites.publishSite(b.owner, b.site.id);
        expect(result.alsoLeftOut).toEqual([]);
        expect(await liveHeadings(b.site.id)).toEqual([
            "Intro, new",
            "Packages",
        ]);
    });

    it("on a plan without approval it isn't enforced (DEC-103)", async () => {
        const b = await business();
        jest.spyOn(planMeter, "isIncluded").mockResolvedValue(false);
        await sites.replaceDraftSections(b.ritika, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Intro, new"), hero("k2", "Packages")],
        });
        const result = await sites.publishSite(b.owner, b.site.id);
        expect(result.overridden).toBe(false);
        expect(await liveHeadings(b.site.id)).toEqual([
            "Intro, new",
            "Packages",
        ]);
    });

    it("a reviewer of another site can't approve its changes (404)", async () => {
        const b = await business();
        const other = await prisma.site.create({
            data: {
                organizationId: b.org.id,
                name: "Other",
                slug: uniq("ca-other-"),
            },
        });
        await expect(
            sites.recordChangeVerdict(b.reviewer, other.id, {
                units: ["site:footer"],
                outcome: "APPROVED",
            }),
        ).rejects.toMatchObject({ status: 404 });
    });

    it("the review's own Approve approves the waiting changes", async () => {
        const b = await business();
        await sites.replaceDraftSections(b.ritika, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Intro, new"), hero("k2", "Packages, new")],
        });
        await sites.createApproval(b.reviewer, b.site.id, {
            outcome: "APPROVED",
        });
        const changes = await sites.getChanges(b.owner, b.site.id);
        expect(changes.units.map((u) => u.approval.state)).toEqual([
            "approved",
            "approved",
        ]);
    });
});
