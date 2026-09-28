/**
 * A Reviewer's Home (round 2, F9) against a real Postgres: Dalia, invited to
 * review Rye's site, sees that site only — not Rye's other site, not a
 * deleted one, not another business's — with its visible pages, who asked
 * for the review while it waits on her, and the notes still open.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import { readReviews } from "./home-reviewer";

const tag = `${process.pid}-${Date.now()}`;

describe("Home F9 Reviewer view (DB)", () => {
    let orgId = "";
    let otherOrgId = "";
    let dalia = "";
    let priya = "";
    let ryeSite = "";
    let homePage = "";
    let menuPage = "";
    let hiddenPage = "";
    let unsharedSite = "";
    let deletedSite = "";
    let elsewhereSite = "";

    async function site(organizationId: string, name: string, extra = {}) {
        return (
            await prisma.site.create({
                data: {
                    organizationId,
                    name,
                    slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${tag}`,
                    ...extra,
                },
            })
        ).id;
    }

    async function page(
        siteId: string,
        organizationId: string,
        title: string,
        path: string,
        extra = {},
    ) {
        return (
            await prisma.page.create({
                data: { siteId, organizationId, title, path, ...extra },
            })
        ).id;
    }

    async function note(
        siteId: string,
        organizationId: string,
        pageId: string | null,
        resolved = false,
    ) {
        await prisma.siteComment.create({
            data: {
                siteId,
                organizationId,
                pageId,
                sectionKey: "hero",
                authorUserId: dalia,
                body: "Tighten this line",
                resolvedAt: resolved ? new Date() : null,
            },
        });
    }

    beforeAll(async () => {
        dalia = (
            await prisma.user.create({
                data: { email: `f9-dalia-${tag}@example.com`, name: "Dalia" },
            })
        ).id;
        priya = (
            await prisma.user.create({
                data: {
                    email: `f9-priya-${tag}@example.com`,
                    name: "Priya Raman",
                },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "Rye & Co.", slug: `f9-rye-${tag}` },
            })
        ).id;
        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Elsewhere", slug: `f9-else-${tag}` },
            })
        ).id;

        ryeSite = await site(orgId, "Rye site", { subdomain: `rye-${tag}` });
        homePage = await page(ryeSite, orgId, "Home", "/", { isHome: true });
        menuPage = await page(ryeSite, orgId, "Menu", "/menu");
        hiddenPage = await page(ryeSite, orgId, "Drafts", "/drafts", {
            hidden: true,
        });
        unsharedSite = await site(orgId, "Rye wholesale");
        deletedSite = await site(orgId, "Rye old", { deletedAt: new Date() });
        elsewhereSite = await site(otherOrgId, "Elsewhere site");

        for (const [organizationId, siteId] of [
            [orgId, ryeSite],
            [orgId, deletedSite],
            [otherOrgId, elsewhereSite],
        ]) {
            await prisma.siteReviewer.create({
                data: { organizationId, siteId, userId: dalia },
            });
        }

        // Asked for, answered, then asked again: waiting on her.
        const at = (iso: string) => new Date(iso);
        for (const [outcome, byUserId, createdAt] of [
            ["REQUESTED", priya, at("2026-09-15T06:00:00.000Z")],
            ["CHANGES_REQUESTED", dalia, at("2026-09-16T06:00:00.000Z")],
            ["REQUESTED", priya, at("2026-09-17T06:00:00.000Z")],
        ] as const) {
            await prisma.siteApproval.create({
                data: {
                    siteId: ryeSite,
                    organizationId: orgId,
                    byUserId,
                    outcome,
                    createdAt,
                },
            });
        }
        // A publish that went past it is not an answer.
        await prisma.siteApproval.create({
            data: {
                siteId: ryeSite,
                organizationId: orgId,
                byUserId: priya,
                outcome: "BYPASSED",
                createdAt: at("2026-09-18T06:00:00.000Z"),
            },
        });

        await note(ryeSite, orgId, homePage);
        await note(ryeSite, orgId, homePage);
        await note(ryeSite, orgId, menuPage, true);
        await note(ryeSite, orgId, null);
        await note(unsharedSite, orgId, null);
    });

    afterAll(async () => {
        await prisma.organization.deleteMany({
            where: { id: { in: [orgId, otherOrgId] } },
        });
        await prisma.user.deleteMany({ where: { id: { in: [dalia, priya] } } });
    });

    it("gives Dalia Rye's granted site only, with its pages and open notes", async () => {
        const reviews = await readReviews(prisma, orgId, dalia);

        expect(reviews).toEqual([
            {
                id: ryeSite,
                name: "Rye site",
                href: `/sites/${ryeSite}/review`,
                requestedBy: "Priya Raman",
                requestedAt: "2026-09-17T06:00:00.000Z",
                // Two on Home, and one on a page that's gone; the settled
                // one on Menu isn't open.
                openNotes: 3,
                pages: [
                    {
                        id: homePage,
                        title: "Home",
                        path: "/",
                        openNotes: 2,
                        href: `/sites/${ryeSite}/review?page=${homePage}`,
                    },
                    {
                        id: menuPage,
                        title: "Menu",
                        path: "/menu",
                        openNotes: 0,
                        href: `/sites/${ryeSite}/review?page=${menuPage}`,
                    },
                ],
                pageCount: 2,
                subdomain: `rye-${tag}`,
                live: false,
            },
        ]);
        const text = JSON.stringify(reviews);
        for (const id of [
            unsharedSite,
            deletedSite,
            elsewhereSite,
            hiddenPage,
        ]) {
            expect(text).not.toContain(id);
        }
    });

    it("reads nothing waiting once she has answered", async () => {
        await prisma.siteApproval.create({
            data: {
                siteId: ryeSite,
                organizationId: orgId,
                byUserId: dalia,
                outcome: "APPROVED",
                createdAt: new Date("2026-09-19T06:00:00.000Z"),
            },
        });

        const [rye] = await readReviews(prisma, orgId, dalia);

        expect(rye.requestedBy).toBeNull();
        expect(rye.requestedAt).toBeNull();
        expect(rye.openNotes).toBe(3);
    });

    it("gives someone with no grants nothing", async () => {
        expect(await readReviews(prisma, orgId, priya)).toEqual([]);
    });

    it("never reaches across businesses", async () => {
        const reviews = await readReviews(prisma, otherOrgId, dalia);

        expect(reviews.map((r) => r.id)).toEqual([elsewhereSite]);
    });
});
