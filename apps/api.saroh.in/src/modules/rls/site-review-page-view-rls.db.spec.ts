import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";

/**
 * Row-level security on a reviewer's pages read (DEC-200, U9, migration
 * `20270113120000_site_review_page_views`), over a NOBYPASSRLS role: one
 * business sees and changes only its own views. Runs only in RLS mode
 * (`TEST_RLS=on`).
 */
const describeRls = isRlsTestMode() ? describe : describe.skip;

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

async function businessWithView(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("page-view-rls") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("page-view")}@example.com`, name: "Meera" },
    });
    const site = await prisma.site.create({
        data: { organizationId: org.id, name, slug: uniq("page-view-site") },
    });
    const page = await prisma.page.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            path: "/",
            title: "Home",
        },
    });
    const row = await prisma.siteReviewPageView.create({
        data: {
            organizationId: org.id,
            siteId: site.id,
            pageId: page.id,
            userId: user.id,
        },
    });
    return {
        orgId: org.id,
        siteId: site.id,
        pageId: page.id,
        userId: user.id,
        viewId: row.id,
    };
}

describeRls("row-level security on SiteReviewPageView", () => {
    let a: Awaited<ReturnType<typeof businessWithView>>;
    let b: Awaited<ReturnType<typeof businessWithView>>;

    beforeAll(async () => {
        a = await businessWithView("Rye & Co.");
        b = await businessWithView("Pulse Fitness");
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("shows a business only its own views, a bogus one none", async () => {
        const own = await runInOrgContext(a.orgId, () =>
            prisma.siteReviewPageView.findMany({ select: { id: true } }),
        );
        expect(own).toEqual([{ id: a.viewId }]);
        await expect(
            runInOrgContext("org_does_not_exist", () =>
                prisma.siteReviewPageView.count(),
            ),
        ).resolves.toBe(0);
    });

    it("can't change, delete or write another business's view", async () => {
        const changed = await runInOrgContext(a.orgId, async () => [
            (
                await prisma.siteReviewPageView.updateMany({
                    where: { id: b.viewId },
                    data: { viewedAt: new Date(0) },
                })
            ).count,
            (
                await prisma.siteReviewPageView.deleteMany({
                    where: { id: b.viewId },
                })
            ).count,
        ]);
        expect(changed).toEqual([0, 0]);
        await expect(
            runInOrgContext(a.orgId, () =>
                prisma.siteReviewPageView.create({
                    data: {
                        organizationId: b.orgId,
                        siteId: b.siteId,
                        pageId: b.pageId,
                        userId: a.userId,
                    },
                }),
            ),
        ).rejects.toThrow(/row-level security/);
    });
});
