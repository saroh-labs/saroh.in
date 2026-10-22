import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";

/**
 * Row-level security on a site's links (DEC-181, #1099, migration
 * `20261225100000_site_links`), over a NOBYPASSRLS role with enforcement
 * on: one business sees, changes and writes only its own links, even with
 * the same label.
 *
 * Runs only in RLS mode (`TEST_RLS=on`): a normal run builds its schema
 * with `db push`, which creates no policies, and connects as the owner.
 */
const describeRls = isRlsTestMode() ? describe : describe.skip;

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;
const LABEL = "diwali-post";

describeRls("row-level security on SiteLink", () => {
    let a = { orgId: "", siteId: "", linkId: "" };
    let b = { orgId: "", siteId: "", linkId: "" };

    async function businessWithLink(name: string) {
        const org = await prisma.organization.create({
            data: { name, slug: uniq("links-rls") },
        });
        const site = await prisma.site.create({
            data: { organizationId: org.id, name, slug: uniq("links-site") },
        });
        const link = await prisma.siteLink.create({
            data: {
                organizationId: org.id,
                siteId: site.id,
                name: "Diwali post",
                label: LABEL,
            },
        });
        return { orgId: org.id, siteId: site.id, linkId: link.id };
    }

    beforeAll(async () => {
        a = await businessWithLink("Rye & Co.");
        b = await businessWithLink("Pulse Fitness");
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("connects as a role row-level security applies to", async () => {
        const [role] = await prisma.$queryRaw<
            Array<{ rolsuper: boolean; rolbypassrls: boolean }>
        >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
        expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    });

    it("shows a business only its own links, a bogus one none, and no context all", async () => {
        const own = await runInOrgContext(a.orgId, () =>
            prisma.siteLink.findMany({
                where: { label: LABEL },
                select: { id: true },
            }),
        );
        const bogus = await runInOrgContext("org_does_not_exist", () =>
            prisma.siteLink.count(),
        );
        // The public intake reads a site's labels with no context.
        const all = await prisma.siteLink.count({
            where: { id: { in: [a.linkId, b.linkId] } },
        });

        expect(own).toEqual([{ id: a.linkId }]);
        expect(bogus).toBe(0);
        expect(all).toBe(2);
    });

    it("can't archive or remove another business's link", async () => {
        const archived = await runInOrgContext(a.orgId, () =>
            prisma.siteLink.updateMany({
                where: { id: b.linkId },
                data: { archivedAt: new Date() },
            }),
        );
        const removed = await runInOrgContext(a.orgId, () =>
            prisma.siteLink.deleteMany({ where: { id: b.linkId } }),
        );
        expect(archived.count).toBe(0);
        expect(removed.count).toBe(0);
        const still = await prisma.siteLink.findUniqueOrThrow({
            where: { id: b.linkId },
        });
        expect(still.archivedAt).toBeNull();
    });

    it("refuses to make a link for another business inside a context", async () => {
        await expect(
            runInOrgContext(a.orgId, () =>
                prisma.siteLink.create({
                    data: {
                        organizationId: b.orgId,
                        siteId: b.siteId,
                        name: "Not mine",
                        label: "not-mine",
                    },
                }),
            ),
        ).rejects.toThrow(/row-level security/);
    });
});
