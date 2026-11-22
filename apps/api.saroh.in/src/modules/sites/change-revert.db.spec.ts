/**
 * Undo one change (website editor plan U47a) against a real Postgres: one
 * waiting section put back as it is live leaves every other change waiting,
 * a new one goes, a deleted one comes back at its place, a stale revision is
 * a 409, and Compare diffs the draft against a past version.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { ChangeRevertService } from "./change-revert";
import { SitesService } from "./sites.service";

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);
const undo = new ChangeRevertService(sites);

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

const hero = (key: string, heading: string) => ({
    key,
    type: "hero",
    contractVersion: 1,
    content: { heading },
});

/** A live site with a Bridal page of three sections, published once. */
async function business() {
    const org = await prisma.organization.create({
        data: { name: "Gulmohar Studio", slug: uniq("cr-org-") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("cr-")}@example.com`, name: "Ritika Sharma" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: user.id,
        role: "OWNER",
        roleKey: "OWNER",
    };
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Gulmohar",
            slug: uniq("cr-site-"),
            subdomain: uniq("crsub"),
        },
    });
    await prisma.page.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            path: "/",
            title: "Home",
            isHome: true,
        },
    });
    const bridal = await prisma.page.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            path: "/bridal",
            title: "Bridal packages",
        },
    });
    await sites.replaceDraftSections(ctx, site.id, bridal.id, {
        sections: [
            hero("k1", "Intro"),
            hero("k2", "Packages"),
            hero("k3", "From our brides"),
        ],
    });
    const first = await sites.publishSite(ctx, site.id);
    return { ctx, site, bridal, first };
}

const keys = async (
    ctx: OrganizationContext,
    siteId: string,
    against?: string,
) => (await sites.getChanges(ctx, siteId, against)).units.map((u) => u.key);

describe("Undo one change (U47a)", () => {
    it("puts one section back and leaves the rest waiting", async () => {
        const b = await business();
        const saved = await sites.replaceDraftSections(
            b.ctx,
            b.site.id,
            b.bridal.id,
            {
                sections: [
                    hero("k1", "Intro"),
                    hero("k2", "Packages, now cheaper"),
                    hero("k3", "From our brides, edited"),
                    hero("k9", "Monsoon offer"),
                ],
            },
        );
        const k2 = `section:${b.bridal.id}:k2`;
        const k3 = `section:${b.bridal.id}:k3`;
        const k9 = `section:${b.bridal.id}:k9`;
        expect(await keys(b.ctx, b.site.id)).toEqual([k2, k3, k9]);

        // A stale revision is refused, and nothing changes.
        await expect(
            undo.revert(b.ctx, b.site.id, {
                unitKey: k2,
                revision: saved.revision - 1,
            }),
        ).rejects.toBeInstanceOf(ConflictException);

        const out = await undo.revert(b.ctx, b.site.id, {
            unitKey: k2,
            revision: saved.revision,
        });
        expect(
            out.draft?.sections.find((s) => s.key === "k2")?.content,
        ).toEqual({
            heading: "Packages",
        });
        expect(await keys(b.ctx, b.site.id)).toEqual([k3, k9]);

        // A section added since goes.
        await undo.revert(b.ctx, b.site.id, { unitKey: k9 });
        expect(await keys(b.ctx, b.site.id)).toEqual([k3]);

        const audit = await prisma.auditEvent.count({
            where: { targetId: b.site.id, action: "site.change.reverted" },
        });
        expect(audit).toBe(2);
    });

    it("brings a deleted section back at its live place", async () => {
        const b = await business();
        await sites.replaceDraftSections(b.ctx, b.site.id, b.bridal.id, {
            sections: [hero("k2", "Packages"), hero("k3", "From our brides")],
        });
        const out = await undo.revert(b.ctx, b.site.id, {
            unitKey: `section:${b.bridal.id}:k1`,
        });
        expect(out.draft?.sections.map((s) => s.key)).toEqual([
            "k1",
            "k2",
            "k3",
        ]);
        expect(await keys(b.ctx, b.site.id)).toEqual([]);
    });

    it("compares the draft against a past version", async () => {
        const b = await business();
        await sites.replaceDraftSections(b.ctx, b.site.id, b.bridal.id, {
            sections: [
                hero("k1", "Intro"),
                hero("k2", "Packages, now cheaper"),
                hero("k3", "From our brides"),
            ],
        });
        await sites.publishSite(b.ctx, b.site.id);
        expect(await keys(b.ctx, b.site.id)).toEqual([]);
        expect(await keys(b.ctx, b.site.id, b.first.publicationId)).toEqual([
            `section:${b.bridal.id}:k2`,
        ]);
    });
});
