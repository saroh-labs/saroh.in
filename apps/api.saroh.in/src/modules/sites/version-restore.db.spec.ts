/**
 * Restore a version as the draft (owner, 20 Nov 2026) against a real
 * Postgres: the version's sections come back into the draft stamped with
 * the person restoring, the live site does not move, a stale revision is a
 * 409 with nothing written, a reader is refused, and it is audited.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { SitesService } from "./sites.service";
import { VersionRestoreService } from "./version-restore";

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);
const versions = new VersionRestoreService(sites);

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

const hero = (key: string, heading: string) => ({
    key,
    type: "hero",
    contractVersion: 1,
    content: { heading },
});

async function person(orgId: string, role: "OWNER" | "ADMIN" | "REVIEWER") {
    const user = await prisma.user.create({
        data: { email: `${uniq("vr-")}@example.com`, name: `Sample ${role}` },
    });
    await prisma.membership.create({
        data: { organizationId: orgId, userId: user.id, role },
    });
    const ctx: OrganizationContext = {
        organizationId: orgId,
        userId: user.id,
        role,
        roleKey: role,
    };
    return ctx;
}

/** A site published twice: version one, then version two, which is live. */
async function business() {
    const org = await prisma.organization.create({
        data: { name: "Sample Studio", slug: uniq("vr-org-") },
    });
    const owner = await person(org.id, "OWNER");
    const admin = await person(org.id, "ADMIN");
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Sample",
            slug: uniq("vr-site-"),
            subdomain: uniq("vrsub"),
        },
    });
    const home = await prisma.page.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            path: "/",
            title: "Home",
            isHome: true,
        },
    });
    await sites.replaceDraftSections(owner, site.id, home.id, {
        sections: [hero("k1", "Intro"), hero("k2", "Packages")],
    });
    const one = await sites.publishSite(owner, site.id);
    await sites.replaceDraftSections(owner, site.id, home.id, {
        sections: [hero("k1", "Intro, new"), hero("k3", "Offer")],
    });
    const two = await sites.publishSite(owner, site.id);
    return { org, owner, admin, site, home, one, two };
}

const liveId = async (siteId: string) =>
    (
        await prisma.site.findUniqueOrThrow({
            where: { id: siteId },
            select: { currentPublicationId: true },
        })
    ).currentPublicationId;

describe("Restore a version as the draft", () => {
    it("puts the version in the draft, stamped with the restorer, and leaves live alone", async () => {
        const b = await business();
        const draft = await sites.getPageDraft(b.admin, b.site.id, b.home.id);

        const out = await versions.restoreAsDraft(
            b.admin,
            b.site.id,
            b.one.publicationId,
            { pageId: b.home.id, revision: draft.revision },
        );

        expect(out.restored).toBe(1);
        expect(out.draft?.sections.map((s) => [s.key, s.content])).toEqual([
            ["k1", { heading: "Intro" }],
            ["k2", { heading: "Packages" }],
        ]);
        // Nothing went live.
        expect(await liveId(b.site.id)).toBe(b.two.publicationId);
        // Every waiting change is the restorer's.
        const changes = await sites.getChanges(b.owner, b.site.id);
        expect(changes.units.length).toBeGreaterThan(0);
        expect(new Set(changes.units.map((u) => u.editedBy))).toEqual(
            new Set([b.admin.userId]),
        );
        expect(
            await prisma.auditEvent.count({
                where: {
                    targetId: b.site.id,
                    action: "site.version.restored_as_draft",
                    actorUserId: b.admin.userId,
                },
            }),
        ).toBe(1);
    });

    it("refuses a stale revision with nothing written", async () => {
        const b = await business();
        const draft = await sites.getPageDraft(b.owner, b.site.id, b.home.id);
        await expect(
            versions.restoreAsDraft(b.owner, b.site.id, b.one.publicationId, {
                pageId: b.home.id,
                revision: draft.revision - 1,
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        const after = await sites.getPageDraft(b.owner, b.site.id, b.home.id);
        expect(after.revision).toBe(draft.revision);
        expect(after.sections.map((s) => s.key)).toEqual(["k1", "k3"]);
    });

    it("refuses a reader", async () => {
        const b = await business();
        const reader = await person(b.org.id, "REVIEWER");
        await expect(
            versions.restoreAsDraft(reader, b.site.id, b.one.publicationId),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("restoring the live version leaves nothing waiting", async () => {
        const b = await business();
        const out = await versions.restoreAsDraft(
            b.owner,
            b.site.id,
            b.two.publicationId,
        );
        expect(out.restored).toBe(0);
        expect((await sites.getChanges(b.owner, b.site.id)).units).toEqual([]);
    });
});
