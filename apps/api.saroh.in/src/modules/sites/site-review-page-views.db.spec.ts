/**
 * Pages read, saved on the server (DEC-200, U9), against a real Postgres:
 * "You've read 3 of 4 pages" counts the pages a reviewer opened since their
 * own latest verdict on the draft, against the pages the site has now, and
 * reads the same from any browser or phone.
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
/**
 * Each write's time, said explicitly rather than slept for: an hour ago and
 * a second apart, so "after" never rests on two writes landing in
 * different milliseconds.
 */
let clock = Date.now() - 3_600_000;
const at = () => new Date((clock += 1_000));

/** A site with four pages, its owner and Meera, a reviewer invited to it. */
async function business() {
    const org = await prisma.organization.create({
        data: { name: "Northwind U9", slug: uniq("u9-org-") },
    });
    const owner = await prisma.user.create({
        data: { email: `${uniq("u9-owner-")}@example.com`, name: "Asha" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const site = await prisma.site.create({
        data: { organizationId: org.id, name: "Northwind", slug: uniq("u9-") },
    });
    const pages = [];
    for (const [path, title] of [
        ["/", "Home"],
        ["/about", "About"],
        ["/menu", "Menu"],
        ["/contact", "Contact"],
    ]) {
        pages.push(
            await prisma.page.create({
                data: {
                    siteId: site.id,
                    organizationId: org.id,
                    path,
                    title,
                    isHome: path === "/",
                },
            }),
        );
    }
    const reviewer = await prisma.user.create({
        data: { email: `${uniq("u9-reviewer-")}@example.com`, name: "Meera" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: reviewer.id, role: "REVIEWER" },
    });
    await prisma.siteReviewer.create({
        data: { organizationId: org.id, siteId: site.id, userId: reviewer.id },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: owner.id,
        role: "OWNER",
    };
    const reviewerCtx: OrganizationContext = {
        organizationId: org.id,
        userId: reviewer.id,
        role: "REVIEWER",
    };
    const [home, about, menu, contact] = pages;
    return { org, site, home, about, menu, contact, ctx, reviewerCtx };
}

type Business = Awaited<ReturnType<typeof business>>;

/** A page opened, at the clock's next second (the service writes "now"). */
async function view(b: Business, pageId: string, ctx = b.reviewerCtx) {
    const result = await sites.recordPageView(ctx, b.site.id, pageId);
    await prisma.siteReviewPageView.updateMany({
        where: { siteId: b.site.id, userId: ctx.userId, pageId },
        data: { viewedAt: at() },
    });
    return result;
}
const pagesRead = async (b: Business, ctx = b.reviewerCtx) =>
    (await sites.getReviewState(ctx, b.site.id)).pagesRead;

/** A verdict (or request) on the draft, at the clock's next second. */
async function verdict(b: Business, by: OrganizationContext, outcome: string) {
    await prisma.siteApproval.create({
        data: {
            siteId: b.site.id,
            organizationId: b.org.id,
            byUserId: by.userId,
            outcome,
            reason: outcome === "CHANGES_REQUESTED" ? "Fix the hours" : null,
            createdAt: at(),
        },
    });
}

describe("pages read, saved on the server (DEC-200, U9)", () => {
    it("counts each page once: Home, About, Home again → 2 of 4", async () => {
        const b = await business();
        await view(b, b.home.id);
        await view(b, b.about.id);
        await view(b, b.home.id);
        expect(await pagesRead(b)).toEqual({ read: 2, total: 4 });
        await expect(
            prisma.siteReviewPageView.count({ where: { siteId: b.site.id } }),
        ).resolves.toBe(2);
    });

    it("reads the same from another session of the same reviewer", async () => {
        const b = await business();
        // The phone records; the desk, a fresh context, reads.
        await view(b, b.menu.id, { ...b.reviewerCtx });
        expect(
            await pagesRead(b, {
                organizationId: b.org.id,
                userId: b.reviewerCtx.userId,
                role: "REVIEWER",
            }),
        ).toEqual({ read: 1, total: 4 });
    });

    it("starts again after the reviewer's own verdict, and counts views after it", async () => {
        const b = await business();
        await view(b, b.home.id);
        await view(b, b.about.id);
        await verdict(b, b.reviewerCtx, "CHANGES_REQUESTED");
        expect(await pagesRead(b)).toEqual({ read: 0, total: 4 });

        await view(b, b.home.id);
        expect(await pagesRead(b)).toEqual({ read: 1, total: 4 });

        await verdict(b, b.reviewerCtx, "APPROVED");
        expect(await pagesRead(b)).toEqual({ read: 0, total: 4 });
    });

    it("ignores someone else's verdict and the owner's request", async () => {
        const b = await business();
        await view(b, b.home.id);
        await verdict(b, b.ctx, "REQUESTED");
        await verdict(b, b.ctx, "APPROVED");
        expect(await pagesRead(b)).toEqual({ read: 1, total: 4 });
    });

    it("drops a deleted page out of both numbers", async () => {
        const b = await business();
        await view(b, b.home.id);
        await view(b, b.contact.id);
        await sites.deletePage(b.ctx, b.site.id, b.contact.id);
        expect(await pagesRead(b)).toEqual({ read: 1, total: 3 });
    });

    it("records nothing for the owner, who edits rather than reads", async () => {
        const b = await business();
        await expect(view(b, b.home.id, b.ctx)).resolves.toEqual({
            recorded: false,
        });
        expect(await pagesRead(b, b.ctx)).toEqual({ read: 0, total: 4 });
        await expect(
            prisma.siteReviewPageView.count({ where: { siteId: b.site.id } }),
        ).resolves.toBe(0);
    });

    it("404s a page on another site, and a site the reviewer isn't invited to", async () => {
        const b = await business();
        const other = await prisma.site.create({
            data: {
                organizationId: b.org.id,
                name: "Other",
                slug: uniq("u9-"),
            },
        });
        const otherPage = await prisma.page.create({
            data: {
                siteId: other.id,
                organizationId: b.org.id,
                path: "/",
                title: "Home",
                isHome: true,
            },
        });
        await expect(view(b, otherPage.id)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        // Not invited to `other`: the scoped lookup doesn't find it.
        await expect(
            sites.recordPageView(b.reviewerCtx, other.id, otherPage.id),
        ).rejects.toBeInstanceOf(NotFoundException);
        // Nor once the invite is taken back.
        await prisma.siteReviewer.deleteMany({ where: { siteId: b.site.id } });
        await expect(view(b, b.home.id)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});
