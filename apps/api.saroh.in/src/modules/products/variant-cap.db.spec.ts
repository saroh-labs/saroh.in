/**
 * The plan's cap on one product's variants (DEC-158), on every write that
 * can add one, against a real Postgres: a new variant on the organization
 * route and on the storefront alias, and a copy. Nothing else adds a
 * variant: a new product starts with none, and the CSV import writes none.
 *
 * What it must never do is here too: variants don't count as products; a
 * product past the cap (after a move to a lower plan) keeps every variant
 * and is still edited, reordered and made smaller, and only one more is
 * refused; one business's override raises its cap; a version published
 * before the row existed caps nothing; and with `PLAN_ENFORCEMENT` off,
 * nothing is refused.
 *
 * The services run as the API builds them; `planMeter` reads the real
 * switch, turned on per business (an override). Catalogue numbers are made
 * up (`fakeVariantCatalog`: 3 / 5 / no cap). Runs in the integration
 * project (TEST_DATABASE_URL).
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma, writeCatalogueVersion } from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import {
    fakeMeteredCatalog,
    fakeVariantCatalog,
} from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { StoresService } from "../stores/stores.service";
import { ProductAccess } from "./product-access";
import { ProductsService } from "./products.service";
import { VariantsService } from "./variants.service";

const tag = `${process.pid}-${Date.now()}`;
/** The version with the `variants` row, and an older one without it. */
const V = 830_000 + Math.floor(Math.random() * 9_000);
const OLDER = V + 10_000;
const MINUTE = 60_000;
let seq = 0;
const uniq = (p: string) => `${p}-${++seq}-${tag}`;

const storeFlags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const stores = new StoresService(storeFlags);
const access = new ProductAccess(stores);
const products = new ProductsService(stores, undefined, access);
const variants = new VariantsService(products);

interface Business {
    orgId: string;
    ownerId: string;
    storeId: string;
    owner: OrganizationContext;
}

function planRow(planId: string, version: number) {
    return prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version,
                interval: "month",
            },
        },
    });
}

/** A business on `planId`@`version` with its owner, a storefront and the switch. */
async function business(
    planId: string,
    { enforce = true, version = V } = {},
): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name: "Kinds", slug: uniq("vcap") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("owner")}@example.test` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    const plan = await planRow(planId, version);
    await prisma.subscription.create({
        data: { organizationId: org.id, planId: plan.id, status: "ACTIVE" },
    });
    // An override needs the flag's definition row (FeatureFlagOverride_flagKey_fkey).
    await prisma.featureFlag.upsert({
        where: { key: FlagKey.PLAN_ENFORCEMENT },
        create: { key: FlagKey.PLAN_ENFORCEMENT, enabledByDefault: false },
        update: {},
    });
    await prisma.featureFlagOverride.create({
        data: {
            flagKey: FlagKey.PLAN_ENFORCEMENT,
            organizationId: org.id,
            enabled: enforce,
        },
    });
    const storeId = (
        await stores.createForUser(user.id, org.id, {
            name: "Hill Road",
            slug: uniq("hill"),
        })
    ).id;
    return {
        orgId: org.id,
        ownerId: user.id,
        storeId,
        owner: { organizationId: org.id, userId: user.id, role: "OWNER" },
    };
}

const scopeOf = (b: Business) => access.write(b.owner, undefined, b.storeId);

/** A product with `n` variants, each added the way the editor adds them. */
async function productWith(b: Business, n: number, name = "Linen shirt") {
    const scope = await scopeOf(b);
    const product = await products.createIn(scope, { name, price: "100" });
    for (let i = 0; i < n; i++) await add(b, product.id);
    return product.id;
}

async function add(b: Business, productId: string) {
    const sku = uniq("sku");
    return variants.createIn(await scopeOf(b), productId, {
        sku,
        title: `Kind ${sku}`,
    });
}

const variantsOf = (productId: string) =>
    prisma.productVariant.count({ where: { productId } });

/** The refusal's body, as the error filter would send it. */
async function refused(p: Promise<unknown>) {
    const err = await p.then(
        () => null,
        (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ForbiddenException);
    return (err as ForbiddenException).getResponse() as {
        message: string;
        details: Record<string, unknown>;
    };
}

beforeAll(async () => {
    const live = new Date(Date.now() - 24 * 60 * MINUTE);
    const withRow = fakeVariantCatalog();
    await writeCatalogueVersion(prisma, {
        version: V,
        catalog: withRow,
        goLiveAt: live,
        policy: "keep",
        planRows: planRows(withRow, V),
    });
    // Published before the row existed: no `variants` module at all.
    const older = fakeMeteredCatalog();
    await writeCatalogueVersion(prisma, {
        version: OLDER,
        catalog: older,
        goLiveAt: live,
        policy: "keep",
        planRows: planRows(older, OLDER),
    });
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("adding a variant (DB, DEC-158)", () => {
    it("takes the plan's last one, then refuses the next with the notice", async () => {
        const b = await business("free");
        const productId = await productWith(b, 3);
        const body = await refused(add(b, productId));
        expect(body).toMatchObject({
            message: "You can have up to 3 variants a product on Plan A",
            details: {
                code: "PLAN_LIMIT_REACHED",
                moduleId: "variants",
                limitKey: "variantsPerProduct",
                limit: 3,
                used: 3,
                upgradeTo: { planId: "grow", name: "Plan B" },
                notice: {
                    body: "No more can be added to this one. Plan B allows more.",
                    cta: "See plans",
                },
            },
        });
        expect(await variantsOf(productId)).toBe(3);
        // No 80% or 100% notice is queued: there is no total to be near.
        expect(
            await prisma.job.count({
                where: { organizationId: b.orgId, type: "plan.limit.notice" },
            }),
        ).toBe(0);
    });

    it("is refused on the storefront route as well", async () => {
        const b = await business("free");
        const productId = await productWith(b, 3);
        await refused(
            variants.create(b.storeId, productId, b.ownerId, {
                sku: uniq("sku"),
                title: "One more",
            }),
        );
        expect(await variantsOf(productId)).toBe(3);
    });

    it("caps each product on its own, and never counts variants as products", async () => {
        const b = await business("free");
        // Three products is the plan's cap on products; each takes its
        // own three variants, twelve things in all.
        const ids = [
            await productWith(b, 3, "Shirt"),
            await productWith(b, 3, "Dress"),
            await productWith(b, 3, "Scarf"),
        ];
        for (const id of ids) expect(await variantsOf(id)).toBe(3);
        const body = await refused(
            products.createIn(await scopeOf(b), {
                name: "A fourth",
                price: "10",
            }),
        );
        // The products refusal counts the three products, not their variants.
        expect(body.details).toMatchObject({
            limitKey: "products",
            limit: 3,
            used: 3,
        });
    });

    it("has room again once one is removed", async () => {
        const b = await business("free");
        const productId = await productWith(b, 3);
        const one = await prisma.productVariant.findFirstOrThrow({
            where: { productId },
        });
        await variants.removeIn(await scopeOf(b), productId, one.id);
        await expect(add(b, productId)).resolves.toHaveProperty("id");
        expect(await variantsOf(productId)).toBe(3);
    });
});

describe("a product already past the cap (DB, DEC-158)", () => {
    /** Six variants made on a plan with no cap, then moved to one with three. */
    async function moved() {
        const b = await business("pro");
        const productId = await productWith(b, 6);
        const free = await planRow("free", V);
        await prisma.subscription.updateMany({
            where: { organizationId: b.orgId },
            data: { planId: free.id },
        });
        return { b, productId };
    }

    it("keeps every variant and is still edited, reordered and made smaller", async () => {
        const { b, productId } = await moved();
        const scope = await scopeOf(b);
        expect(await variantsOf(productId)).toBe(6);

        // The product itself: its price and name.
        await expect(
            products.patchIn(scope, productId, {
                name: "Linen shirt, washed",
                price: "120",
            }),
        ).resolves.toBeDefined();

        // A variant: its title, SKU and price.
        const all = await prisma.productVariant.findMany({
            where: { productId },
            orderBy: { position: "asc" },
        });
        await expect(
            variants.updateIn(scope, productId, all[0].id, {
                sku: all[0].sku,
                title: "Renamed",
                price: "130",
            }),
        ).resolves.toEqual({ id: all[0].id });

        // Their order.
        const order = all.map((v) => v.id).reverse();
        const listed = await variants.reorderIn(scope, productId, {
            ids: order,
        });
        expect(listed.map((v) => v.id)).toEqual(order);
        expect(await variantsOf(productId)).toBe(6);

        // Removing one is never refused.
        await expect(
            variants.removeIn(scope, productId, all[1].id),
        ).resolves.toEqual({ id: all[1].id });
        expect(await variantsOf(productId)).toBe(5);
    });

    it("is refused only one more, and told it keeps what it has", async () => {
        const { b, productId } = await moved();
        const body = await refused(add(b, productId));
        expect(body.details).toMatchObject({
            code: "PLAN_LIMIT_REACHED",
            limit: 3,
            used: 6,
            notice: {
                body: "No more can be added to this one. It keeps the 6 it has. Plan B allows more.",
            },
        });
        expect(await variantsOf(productId)).toBe(6);
        // Still past the cap after a removal: still no more, still all kept.
        const one = await prisma.productVariant.findFirstOrThrow({
            where: { productId },
        });
        await variants.removeIn(await scopeOf(b), productId, one.id);
        await refused(add(b, productId));
        expect(await variantsOf(productId)).toBe(5);
    });
});

describe("copying a product (DB, DEC-158)", () => {
    it("copies one at the cap, variants and all", async () => {
        const b = await business("grow");
        const productId = await productWith(b, 5);
        const copy = await products.duplicateIn(await scopeOf(b), productId);
        expect(await variantsOf(copy.id)).toBe(5);
    });

    it("refuses a copy that would start past the cap, and leaves the original", async () => {
        const b = await business("pro");
        const productId = await productWith(b, 6);
        const grow = await planRow("grow", V);
        await prisma.subscription.updateMany({
            where: { organizationId: b.orgId },
            data: { planId: grow.id },
        });
        const body = await refused(
            products.duplicateIn(await scopeOf(b), productId),
        );
        expect(body.details).toMatchObject({
            code: "PLAN_LIMIT_REACHED",
            limitKey: "variantsPerProduct",
            limit: 5,
            notice: {
                body: "A copy would have 6, so it can't be made. Plan C has no limit.",
            },
        });
        expect(await variantsOf(productId)).toBe(6);
        expect(
            await prisma.product.count({ where: { organizationId: b.orgId } }),
        ).toBe(1);
    });
});

describe("where nothing caps them (DB, DEC-158)", () => {
    it("one business's limit override raises its cap", async () => {
        const b = await business("free");
        const productId = await productWith(b, 3);
        await refused(add(b, productId));
        await prisma.entitlementOverride.create({
            data: {
                organizationId: b.orgId,
                kind: "limit",
                key: "variants",
                moduleKey: "variants",
                value: 5,
                reason: "test",
                grantedByUserId: "staff",
            },
        });
        await add(b, productId);
        await add(b, productId);
        const body = await refused(add(b, productId));
        expect(body.details).toMatchObject({ limit: 5, used: 5 });
    });

    it("a raise does the same, and never lowers the plan's own", async () => {
        const b = await business("free");
        const productId = await productWith(b, 3);
        const raise = await prisma.entitlementOverride.create({
            data: {
                organizationId: b.orgId,
                kind: "raise",
                key: "variants",
                moduleKey: "variants",
                value: 4,
                reason: "test",
                grantedByUserId: "staff",
            },
        });
        await add(b, productId);
        await refused(add(b, productId));
        await prisma.entitlementOverride.update({
            where: { id: raise.id },
            data: { value: 1 },
        });
        const other = await productWith(b, 3, "Dress");
        expect(await variantsOf(other)).toBe(3);
    });

    it("a plan with no cap takes any number", async () => {
        const b = await business("pro");
        expect(await variantsOf(await productWith(b, 7))).toBe(7);
    });

    it("a version published before the row existed caps nothing", async () => {
        const b = await business("free", { version: OLDER });
        const productId = await productWith(b, 7);
        expect(await variantsOf(productId)).toBe(7);
        await expect(
            products.duplicateIn(await scopeOf(b), productId),
        ).resolves.toHaveProperty("id");
    });

    it("refuses nothing with the switch off", async () => {
        const b = await business("free", { enforce: false });
        expect(await variantsOf(await productWith(b, 7))).toBe(7);
    });
});
