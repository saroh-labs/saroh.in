/**
 * Change units (website area U7) against a real Postgres: saves stamp who
 * changed each section, carried by key across the delete-and-recreate; site
 * settings and removals are stamped on the site; the changes endpoint lists
 * them by person; and every count of "changes waiting" is that list's
 * length.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
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

async function person(orgId: string, name: string, role: "OWNER" | "ADMIN") {
    const user = await prisma.user.create({
        data: { email: `${uniq("cu-")}@example.com`, name },
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
    return { user, ctx };
}

/** A live site: a home page and a Bridal page of three sections. */
async function business() {
    const org = await prisma.organization.create({
        data: { name: "Gulmohar Studio", slug: uniq("cu-org-") },
    });
    const mohit = await person(org.id, "Mohit", "OWNER");
    const ritika = await person(org.id, "Ritika Sharma", "ADMIN");
    const arjun = await person(org.id, "Arjun Rao", "ADMIN");
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Gulmohar",
            slug: uniq("cu-site-"),
            subdomain: uniq("cusub"),
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
    const sections = [
        hero("k1", "Intro"),
        hero("k2", "Packages"),
        hero("k3", "From our brides"),
    ];
    await sites.replaceDraftSections(mohit.ctx, site.id, bridal.id, {
        sections,
    });
    await sites.publishSite(mohit.ctx, site.id);
    return { org, site, bridal, mohit, ritika, arjun, sections };
}

async function stampOf(siteId: string, key: string) {
    const row = await prisma.section.findFirstOrThrow({
        where: { key, pageVersion: { page: { siteId } } },
        select: { lastEditedByUserId: true, lastEditedAt: true },
    });
    return row;
}

describe("change units with attribution (U7)", () => {
    // A hero is always "Top of the page" (RULES §1), whatever its heading.
    it("lists each change by who made it, and every count agrees", async () => {
        const b = await business();
        const [, k2, k3] = b.sections;

        await sites.replaceDraftSections(b.ritika.ctx, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Intro, rewritten"), k2!, k3!],
        });
        await sites.replaceDraftSections(b.arjun.ctx, b.site.id, b.bridal.id, {
            sections: [
                hero("k1", "Intro, rewritten"),
                k2!,
                k3!,
                hero("k9", "Two photos"),
            ],
        });
        await sites.updateFooter(b.mohit.ctx, b.site.id, {
            format: "markdown",
            value: "Open Monday 11 am to 8 pm",
        });

        const changes = await sites.getChanges(b.mohit.ctx, b.site.id);
        expect(changes.units.map((u) => [u.key, u.label, u.editedBy])).toEqual([
            [
                `section:${b.bridal.id}:k1`,
                "Changed · Top of the page",
                b.ritika.user.id,
            ],
            [
                `section:${b.bridal.id}:k9`,
                "Added · Top of the page",
                b.arjun.user.id,
            ],
            ["site:footer", "Changed · Footer", b.mohit.user.id],
        ]);
        expect(changes.groups.map((g) => [g.name, g.you])).toEqual([
            ["Mohit", true],
            ["Arjun Rao", false],
            ["Ritika Sharma", false],
        ]);
        expect(changes.count).toBe(3);
        // k1 untouched by Arjun's save: still Ritika's.
        expect((await stampOf(b.site.id, "k1")).lastEditedByUserId).toBe(
            b.ritika.user.id,
        );

        // The status chip, Overview, phone bar and All sites read these.
        const detail = await sites.getSite(b.mohit.ctx, b.site.id);
        const list = await sites.listSites(b.mohit.ctx);
        expect(detail.pendingChanges).toBe(3);
        expect(list.find((s) => s.id === b.site.id)?.pendingChanges).toBe(3);
        expect(detail.pendingSectionChanges).toBe(2);
    });

    it("makes the last person to edit a section its editor, and a no-op save stamps nobody", async () => {
        const b = await business();
        const [, k2, k3] = b.sections;
        await sites.replaceDraftSections(b.ritika.ctx, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Ritika's intro"), k2!, k3!],
        });
        await sites.replaceDraftSections(b.mohit.ctx, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Mohit's intro"), k2!, k3!],
        });
        const before = await stampOf(b.site.id, "k1");
        expect(before.lastEditedByUserId).toBe(b.mohit.user.id);

        // Arjun saves the page exactly as it is.
        await sites.replaceDraftSections(b.arjun.ctx, b.site.id, b.bridal.id, {
            sections: [hero("k1", "Mohit's intro"), k2!, k3!],
        });
        expect(await stampOf(b.site.id, "k1")).toEqual(before);
        expect((await stampOf(b.site.id, "k2")).lastEditedByUserId).toBe(
            b.mohit.user.id,
        );
    });

    it("says who removed a section, though its row is gone", async () => {
        const b = await business();
        const [k1, k2] = b.sections;
        await sites.replaceDraftSections(b.ritika.ctx, b.site.id, b.bridal.id, {
            sections: [k1!, k2!],
        });
        const changes = await sites.getChanges(b.mohit.ctx, b.site.id);
        expect(changes.units).toEqual([
            expect.objectContaining({
                key: `section:${b.bridal.id}:k3`,
                label: "Removed · Top of the page",
                editedBy: b.ritika.user.id,
            }),
        ]);
    });

    it("lists a page's link change once, with its forward, by who changed it", async () => {
        const b = await business();
        await sites.updatePage(b.arjun.ctx, b.site.id, b.bridal.id, {
            path: "/bridal-makeup",
        });
        const changes = await sites.getChanges(b.mohit.ctx, b.site.id);
        expect(changes.units).toEqual([
            expect.objectContaining({
                key: `page:${b.bridal.id}`,
                label: "Page link changed",
                editedBy: b.arjun.user.id,
            }),
        ]);
    });

    it("puts changes from before stamps under Earlier changes", async () => {
        const b = await business();
        await prisma.site.update({
            where: { id: b.site.id },
            data: { seoTitle: "Bridal makeup in Rohtak" },
        });
        const changes = await sites.getChanges(b.mohit.ctx, b.site.id);
        expect(changes.groups).toEqual([
            {
                userId: null,
                name: null,
                you: false,
                units: ["site:search"],
            },
        ]);
    });

    it("has nothing to diff before the first publish", async () => {
        const org = await prisma.organization.create({
            data: { name: "New Studio", slug: uniq("cu-org-") },
        });
        const owner = await person(org.id, "Asha", "OWNER");
        const site = await prisma.site.create({
            data: {
                organizationId: org.id,
                name: "New",
                slug: uniq("cu-site-"),
            },
        });
        const changes = await sites.getChanges(owner.ctx, site.id);
        expect(changes.count).toBeNull();
        expect(changes.units).toEqual([]);
    });

    it("is not found for another business", async () => {
        const a = await business();
        const other = await prisma.organization.create({
            data: { name: "Other", slug: uniq("cu-org-") },
        });
        const stranger = await person(other.id, "Kiran", "OWNER");
        await expect(
            sites.getChanges(stranger.ctx, a.site.id),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
