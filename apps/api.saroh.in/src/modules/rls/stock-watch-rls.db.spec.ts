import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";

/**
 * Row-level security and the CHECK on "Tell me when it's back" (automatic
 * notices U23 #1154, migration `20261223230000_stock_watches`), over a
 * NOBYPASSRLS role with enforcement on: one business sees and writes only
 * its own watches; the database refuses an empty or mixed-case address, a
 * watch naming another business's product, and a second open watch for
 * one address on one product or option.
 *
 * Runs only in RLS mode (`TEST_RLS=on`): a normal run builds its schema
 * with `db push`, which creates no policies and no CHECKs, and connects as
 * the owner.
 */
const describeRls = isRlsTestMode() ? describe : describe.skip;

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

async function businessWithWatch(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("watch-rls") },
    });
    const product = await prisma.product.create({
        data: {
            organizationId: org.id,
            name: "Neem soap",
            slug: uniq("soap"),
            price: "120.00",
            currency: "INR",
        },
    });
    const variant = await prisma.productVariant.create({
        data: { productId: product.id, sku: uniq("sku"), title: "Large" },
    });
    const site = await prisma.site.create({
        data: { organizationId: org.id, name: "Site", slug: uniq("site") },
    });
    const watch = await prisma.stockWatch.create({
        data: {
            organizationId: org.id,
            productId: product.id,
            siteId: site.id,
            email: "asha@example.com",
            consentAt: new Date(),
        },
    });
    return {
        orgId: org.id,
        productId: product.id,
        variantId: variant.id,
        siteId: site.id,
        watchId: watch.id,
    };
}

describeRls("row-level security on StockWatch", () => {
    let a: Awaited<ReturnType<typeof businessWithWatch>>;
    let b: Awaited<ReturnType<typeof businessWithWatch>>;

    beforeAll(async () => {
        a = await businessWithWatch("Rye & Co.");
        b = await businessWithWatch("Pulse Fitness");
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

    it("shows a business only its own watches, a bogus one none, and no context all", async () => {
        const own = await runInOrgContext(a.orgId, () =>
            prisma.stockWatch.findMany({ select: { id: true } }),
        );
        const bogus = await runInOrgContext("org_does_not_exist", () =>
            prisma.stockWatch.count(),
        );
        const all = await prisma.stockWatch.count({
            where: { id: { in: [a.watchId, b.watchId] } },
        });
        expect(own).toEqual([{ id: a.watchId }]);
        expect(bogus).toBe(0);
        expect(all).toBe(2);
    });

    it("can't read, stop or delete another business's watch", async () => {
        const found = await runInOrgContext(a.orgId, () =>
            prisma.stockWatch.findUnique({ where: { id: b.watchId } }),
        );
        const changed = await runInOrgContext(a.orgId, () =>
            prisma.stockWatch.updateMany({
                where: { id: b.watchId },
                data: { cancelledAt: new Date() },
            }),
        );
        const deleted = await runInOrgContext(a.orgId, () =>
            prisma.stockWatch.deleteMany({ where: { id: b.watchId } }),
        );
        expect(found).toBeNull();
        expect(changed.count).toBe(0);
        expect(deleted.count).toBe(0);
        await expect(
            prisma.stockWatch.findUniqueOrThrow({ where: { id: b.watchId } }),
        ).resolves.toMatchObject({ cancelledAt: null });
    });

    it("refuses to write a watch for another business inside a context", async () => {
        await expect(
            runInOrgContext(a.orgId, () =>
                prisma.stockWatch.create({
                    data: {
                        organizationId: b.orgId,
                        productId: b.productId,
                        siteId: b.siteId,
                        email: "meera@example.com",
                        consentAt: new Date(),
                    },
                }),
            ),
        ).rejects.toThrow(/row-level security/);
    });
});

describeRls("the watch's CHECK and indexes", () => {
    let own: Awaited<ReturnType<typeof businessWithWatch>>;
    let other: Awaited<ReturnType<typeof businessWithWatch>>;

    beforeAll(async () => {
        own = await businessWithWatch("Kavi Dental");
        other = await businessWithWatch("Northwind Supply");
    });

    const watch = (data: {
        email?: string;
        productId?: string;
        variantId?: string | null;
        toldAt?: Date | null;
    }) =>
        prisma.stockWatch.create({
            data: {
                organizationId: own.orgId,
                productId: data.productId ?? own.productId,
                variantId: data.variantId ?? null,
                siteId: own.siteId,
                email: data.email ?? "new@example.com",
                consentAt: new Date(),
                toldAt: data.toldAt ?? null,
            },
        });

    it("refuses an empty address, and one not lower-cased", async () => {
        await expect(watch({ email: "  " })).rejects.toThrow(
            /StockWatch_email_check/,
        );
        await expect(watch({ email: "Asha@example.com" })).rejects.toThrow(
            /StockWatch_email_check/,
        );
    });

    it("refuses a watch naming another business's product", async () => {
        await expect(watch({ productId: other.productId })).rejects.toThrow();
    });

    it("one open watch per address per product, and per option", async () => {
        await expect(watch({ email: "asha@example.com" })).rejects.toThrow();
        await expect(
            watch({ email: "asha@example.com", variantId: own.variantId }),
        ).resolves.toMatchObject({ variantId: own.variantId });
        await expect(
            watch({ email: "asha@example.com", variantId: own.variantId }),
        ).rejects.toThrow();
        // A told one is no longer open: a new "Tell me" may follow.
        await prisma.stockWatch.updateMany({
            where: { id: own.watchId },
            data: { toldAt: new Date() },
        });
        await expect(
            watch({ email: "asha@example.com" }),
        ).resolves.toMatchObject({ toldAt: null });
    });
});
