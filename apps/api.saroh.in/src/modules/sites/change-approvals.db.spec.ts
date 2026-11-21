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
import { env } from "../../env";
import type { EntitlementService } from "../billing/entitlement.service";
import { planMeter } from "../billing/metering.service";
import type { RestoreSnapshot } from "../mcp/restore-point.service";
import { RestorePointService } from "../mcp/restore-point.service";
import { restoreSnapshot } from "../mcp/tools/site.tools";
import type { OrgAction } from "../organizations/organization-actions";
import { UNNAMED_TEAMMATE } from "./change-approvals";
import { stampDraftEditors, SYSTEM_EDITOR } from "./draft-editors";
import { SiteRedirectsService } from "./site-redirects.service";
import { SitesService } from "./sites.service";
import { addToMenu } from "./template-sync";

// Leave out and per-change approval belong to the Website area (DEC-240).
const areaBefore = env.WEBSITE_AREA;
beforeAll(() => {
    env.WEBSITE_AREA = "on";
});
afterAll(() => {
    env.WEBSITE_AREA = areaBefore;
});

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

    it("with the Website area off, refuses the whole draft as before (DEC-240, DEC-071)", async () => {
        const b = await business();
        await sites.replaceDraftSections(b.ritika, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Intro, new"), hero("k2", "Packages, new")],
        });
        await sites.recordChangeVerdict(b.reviewer, b.site.id, {
            units: [b.k1],
            outcome: "APPROVED",
        });
        env.WEBSITE_AREA = "off";
        try {
            // No partial publish of the approved change: refused whole.
            await expect(
                sites.publishSite(b.owner, b.site.id, { leaveOut: [b.k2] }),
            ).rejects.toMatchObject({
                response: {
                    details: {
                        code: "APPROVAL_REQUIRED",
                        reason: "approvalRequired",
                    },
                },
            });
            expect(await liveHeadings(b.site.id)).toEqual([
                "Intro",
                "Packages",
            ]);
            // An owner's override takes everything, as before.
            const result = await sites.publishSite(b.owner, b.site.id, {
                override: true,
            });
            expect(result.overridden).toBe(true);
            expect(await liveHeadings(b.site.id)).toEqual([
                "Intro, new",
                "Packages, new",
            ]);
        } finally {
            env.WEBSITE_AREA = "on";
        }
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

/** The draft as an AI connection's restore point keeps it. */
async function restorePoint(b: { org: { id: string }; site: { id: string } }) {
    const points = new RestorePointService() as unknown as {
        snapshotOf(org: string, site: string): Promise<RestoreSnapshot>;
    };
    return points.snapshotOf(b.org.id, b.site.id);
}

describe("every writer says who changed the draft (KTD-4, R2/R4 21 Nov 2026)", () => {
    beforeEach(() => {
        jest.spyOn(planMeter, "isIncluded").mockResolvedValue(true);
    });
    afterEach(() => jest.restoreAllMocks());

    it("an AI restore puts a teammate's change back as theirs, waiting, never as the owner's", async () => {
        const b = await business();
        // Ritika's changes, kept by her connection's restore point.
        await sites.updatePage(b.ritika, b.site.id, b.bridal.id, {
            title: "Ritika's page",
        });
        await sites.updateSettings(b.ritika, b.site.id, {
            seoTitle: "Ritika's search line",
        });
        await sites.replaceDraftSections(b.ritika, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Ritika's intro"), hero("k2", "Packages")],
        });
        const point = await restorePoint(b);
        // The owner changes each one after her.
        await sites.updatePage(b.owner, b.site.id, b.bridal.id, {
            title: "Owner's page",
        });
        await sites.updateSettings(b.owner, b.site.id, {
            seoTitle: "Owner's search line",
        });
        await sites.replaceDraftSections(b.owner, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Owner's intro"), hero("k2", "Packages")],
        });

        await restoreSnapshot(b.ritika, b.site.id, point);

        const changes = await sites.getChanges(b.owner, b.site.id);
        const byKey = new Map(changes.units.map((u) => [u.key, u]));
        for (const key of [`page:${b.bridal.id}`, "site:search", b.k1]) {
            expect(byKey.get(key)).toMatchObject({
                editedBy: b.ritika.userId,
                approval: { state: "waiting" },
            });
        }
        // Every change waits, so nothing goes out without an approval.
        await expect(
            sites.publishSite(b.owner, b.site.id),
        ).rejects.toMatchObject({ status: 409 });
        expect(await liveHeadings(b.site.id)).toEqual(["Intro", "Packages"]);
    });

    it("removing an old link that forwards names the remover (R4)", async () => {
        const b = await business();
        const redirects = new SiteRedirectsService();
        const link = await redirects.create(b.owner, b.site.id, {
            fromPath: "/old-bridal",
            toPath: "/",
        });
        await sites.publishSite(b.owner, b.site.id);
        await redirects.remove(b.ritika, b.site.id, link.id);
        const page = await prisma.page.findUniqueOrThrow({
            where: { id: b.bridal.id },
            select: { settingsEditedByUserId: true },
        });
        expect(page.settingsEditedByUserId).toBe(b.ritika.userId);
        const unit = (await sites.getChanges(b.owner, b.site.id)).units.find(
            (u) => u.key === `page:${b.bridal.id}`,
        );
        expect(unit).toMatchObject({
            editedBy: b.ritika.userId,
            approval: { state: "waiting" },
        });
    });
});

describe("Saroh's own writes wait for approval (21 Nov)", () => {
    beforeEach(() => {
        jest.spyOn(planMeter, "isIncluded").mockResolvedValue(true);
    });
    afterEach(() => jest.restoreAllMocks());

    it("a page a module switch adds to the menu is Saroh's change, never the owner's older one", async () => {
        const b = await business({ approval: false });
        await prisma.site.update({
            where: { id: b.site.id },
            data: { navigation: { items: [{ pageId: b.bridal.id }] } },
        });
        await sites.publishSite(b.owner, b.site.id);
        await prisma.site.update({
            where: { id: b.site.id },
            data: { publishNeedsApproval: true },
        });
        // The owner changed the menu once, and that stamp is still there.
        await stampDraftEditors(prisma, b.site.id, b.owner.userId, [
            "site:menu",
        ]);
        const about = await prisma.page.create({
            data: {
                siteId: b.site.id,
                organizationId: b.org.id,
                path: "/about",
                title: "About",
            },
        });
        await prisma.$transaction((tx) =>
            addToMenu(tx, b.site.id, [about.id], null),
        );
        const unit = (await sites.getChanges(b.owner, b.site.id)).units.find(
            (u) => u.key === "site:menu",
        );
        expect(unit).toMatchObject({
            editedBy: SYSTEM_EDITOR,
            approval: { state: "waiting" },
        });

        // A person's addition is theirs.
        const team = await prisma.page.create({
            data: {
                siteId: b.site.id,
                organizationId: b.org.id,
                path: "/team",
                title: "Team",
            },
        });
        await prisma.$transaction((tx) =>
            addToMenu(tx, b.site.id, [team.id], b.ritika.userId),
        );
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: b.site.id },
            select: { draftEditors: true },
        });
        expect(site.draftEditors).toMatchObject({
            "site:menu": { userId: b.ritika.userId },
        });
    });
});

describe("site verdicts (05 L2, R5, 01 W1)", () => {
    beforeEach(() => {
        jest.spyOn(planMeter, "isIncluded").mockResolvedValue(true);
    });
    afterEach(() => jest.restoreAllMocks());

    it("five approvals of one change at once write one row, and each answers", async () => {
        const b = await business();
        await sites.replaceDraftSections(b.ritika, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Intro, new"), hero("k2", "Packages")],
        });
        const results = await Promise.all(
            Array.from({ length: 5 }, () =>
                sites.recordChangeVerdict(b.reviewer, b.site.id, {
                    units: [b.k1],
                    outcome: "APPROVED",
                }),
            ),
        );
        expect(results).toEqual(Array(5).fill({ recorded: 1 }));
        expect(
            await prisma.siteChangeApproval.count({
                where: { siteId: b.site.id, unitKey: b.k1 },
            }),
        ).toBe(1);
    });

    it("refuses a verdict where approval is off, or the plan has none (409)", async () => {
        const off = await business({ approval: false });
        await sites.replaceDraftSections(
            off.ritika,
            off.site.id,
            off.bridal.id,
            {
                sections: [hero("k1", "Intro, new"), hero("k2", "Packages")],
            },
        );
        await expect(
            sites.recordChangeVerdict(off.reviewer, off.site.id, {
                units: [off.k1],
                outcome: "CHANGES_REQUESTED",
                reason: "Old prices",
            }),
        ).rejects.toMatchObject({ status: 409 });

        const on = await business();
        await sites.replaceDraftSections(on.ritika, on.site.id, on.bridal.id, {
            sections: [hero("k1", "Intro, new"), hero("k2", "Packages")],
        });
        jest.spyOn(planMeter, "isIncluded").mockResolvedValue(false);
        await expect(
            sites.recordChangeVerdict(on.reviewer, on.site.id, {
                units: [on.k1],
                outcome: "APPROVED",
            }),
        ).rejects.toMatchObject({ status: 409 });
        expect(
            await prisma.siteChangeApproval.count({
                where: { siteId: { in: [off.site.id, on.site.id] } },
            }),
        ).toBe(0);
    });

    it("the review's own Approve, sent three times at once, writes each change's row once (21 Nov)", async () => {
        const b = await business();
        await sites.replaceDraftSections(b.ritika, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Intro, new"), hero("k2", "Packages, new")],
        });
        await Promise.all(
            Array.from({ length: 3 }, () =>
                sites.createApproval(b.reviewer, b.site.id, {
                    outcome: "APPROVED",
                }),
            ),
        );
        // A one-change verdict after it, the same, isn't written again.
        await sites.recordChangeVerdict(b.reviewer, b.site.id, {
            units: [b.k1],
            outcome: "APPROVED",
        });
        const rows = await prisma.siteChangeApproval.groupBy({
            by: ["unitKey"],
            where: { siteId: b.site.id },
            _count: true,
        });
        expect(
            Object.fromEntries(rows.map((r) => [r.unitKey, r._count])),
        ).toEqual({ [b.k1]: 1, [b.k2]: 1 });
    });

    it("the review's own Approve answers no change where approval is off, or the plan has none", async () => {
        const off = await business({ approval: false });
        const on = await business();
        for (const b of [off, on]) {
            await sites.replaceDraftSections(b.ritika, b.site.id, b.bridal.id, {
                sections: [hero("k1", "Intro, new"), hero("k2", "Packages")],
            });
        }
        await sites.createApproval(off.reviewer, off.site.id, {
            outcome: "APPROVED",
        });
        jest.spyOn(planMeter, "isIncluded").mockResolvedValue(false);
        await sites.createApproval(on.reviewer, on.site.id, {
            outcome: "APPROVED",
        });
        // The review itself is kept (advisory, DEC-047); no change is.
        expect(
            await prisma.siteApproval.count({
                where: { siteId: { in: [off.site.id, on.site.id] } },
            }),
        ).toBe(2);
        expect(
            await prisma.siteChangeApproval.count({
                where: { siteId: { in: [off.site.id, on.site.id] } },
            }),
        ).toBe(0);
        // Back on a plan with approval, Ritika's change still waits.
        jest.spyOn(planMeter, "isIncluded").mockResolvedValue(true);
        const unit = (await sites.getChanges(on.owner, on.site.id)).units.find(
            (u) => u.key === on.k1,
        );
        expect(unit?.approval.state).toBe("waiting");
    });

    it('a reviewer reads a nameless teammate as "A teammate", never their email', async () => {
        const b = await business();
        await prisma.user.update({
            where: { id: b.ritika.userId },
            data: { name: null },
        });
        await prisma.user.update({
            where: { id: b.owner.userId },
            data: { name: "" },
        });
        await sites.replaceDraftSections(b.ritika, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Intro, new"), hero("k2", "Packages")],
        });
        const seen = await sites.getChanges(b.reviewer, b.site.id);
        const text = JSON.stringify(seen);
        expect(text).not.toContain("@example.com");
        expect(seen.groups[0]).toMatchObject({ name: UNNAMED_TEAMMATE });
        expect(
            seen.units[0].approval.approvers.find(
                (a) => a.id === b.owner.userId,
            )?.name,
        ).toBe(UNNAMED_TEAMMATE);
        // The owner, who may read the team, still sees the email.
        expect(
            JSON.stringify(await sites.getChanges(b.owner, b.site.id)),
        ).toContain("@example.com");
    });
});
