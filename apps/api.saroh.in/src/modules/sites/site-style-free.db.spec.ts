/**
 * Free and paid looks, typefaces and colourways (DEC-177), against a real
 * Postgres: a business on a plan without `themes` picks any free look,
 * keeps its own template's typeface and colourway, and is refused a paid
 * one with the plan's `MODULE_LOCKED`; a plan with `themes` picks anything;
 * and a free list the operator publishes in admin › Plans and modules
 * applies at once, through the same draft and publish the console uses.
 *
 * The catalogue is made up (`fakeMeteredCatalog`, every price zero so the
 * billing provider holds nothing). The site is the salon template's, made
 * in its Kesar colourway with Fraunces and Inter Tight. Runs in the
 * integration project (TEST_DATABASE_URL), plain and RLS.
 */
// The controller's guard pulls in better-auth (ESM), which Jest can't load;
// the publish is called on the controller directly, so the guard is a
// stand-in.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));

import { ForbiddenException } from "@nestjs/common";
import { prisma, writeCatalogueVersion } from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { planRows } from "@saroh/pricing-catalog";
import { getTemplate } from "@saroh/templates";

import { fakeMeteredCatalog } from "../../../test/fixtures/pricing-catalog";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import type { OrganizationContext } from "../../common/types/organization-context";
import { AdminAuditService } from "../admin/admin-audit.service";
import type { EntitlementService } from "../billing/entitlement.service";
import { FlagKey } from "../feature-flags/flags";
import { AdminPricingController } from "../pricing/admin-pricing.controller";
import { CatalogueWritesService } from "../pricing/catalogue-writes.service";
import { CatalogueService } from "../pricing/catalogue.service";
import { CouponsService } from "../pricing/coupons.service";
import { ImpactService } from "../pricing/impact.service";
import type { SiteStyle } from "./site-style";
import { templateColourways } from "./site-style-offer";
import { SitesService } from "./sites.service";

const tag = `${process.pid}x${Date.now().toString(36)}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;
const V = 1;

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);
const audit = new AdminAuditService();
const admin = new AdminPricingController(
    new CatalogueService(new ImpactService()),
    new CatalogueWritesService(audit),
    new CouponsService(audit),
    new IdempotencyService(),
);

const salon = getTemplate("salon", 1)!;
const [kesar, mauve] = templateColourways(salon);
const OWN_PAIR = "fraunces-inter-tight";

/** Made up, with no price: the provider holds no version back. */
function catalogue(edit?: (c: Catalog) => void): Catalog {
    return fakeMeteredCatalog((c) => {
        for (const p of c.plans) p.pricePaise = 0;
        c.freeStyles = {
            looks: ["quiet", "folio", "live"],
            fontPairs: [],
            colourways: [],
        };
        edit?.(c);
    });
}

async function flagOn(key: string, organizationId: string) {
    await prisma.featureFlag.upsert({
        where: { key },
        create: { key, enabledByDefault: false },
        update: {},
    });
    await prisma.featureFlagOverride.create({
        data: { flagKey: key, organizationId, enabled: true },
    });
}

/** A business on `planId`@V, enforced, with looks on, and its salon site. */
async function business(
    planId: "free" | "pro",
): Promise<{ owner: OrganizationContext; siteId: string }> {
    const org = await prisma.organization.create({
        data: { name: "Kesar Salon", slug: uniq("free-styles") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("owner")}@example.com` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    const plan = await prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version: V,
                interval: "month",
            },
        },
    });
    await prisma.subscription.create({
        data: { organizationId: org.id, planId: plan.id, status: "ACTIVE" },
    });
    await flagOn(FlagKey.PLAN_ENFORCEMENT, org.id);
    await flagOn(FlagKey.SITE_LOOKS, org.id);
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Kesar Salon",
            slug: uniq("salon"),
            templateId: salon.id,
            templateVersion: salon.version,
            templateStyleId: kesar.id,
            style: { ...kesar.style, fontPair: OWN_PAIR } as object,
        },
        select: { id: true },
    });
    return {
        owner: { organizationId: org.id, userId: user.id, role: "OWNER" },
        siteId: site.id,
    };
}

async function stored(siteId: string): Promise<SiteStyle> {
    const row = await prisma.site.findUniqueOrThrow({
        where: { id: siteId },
        select: { style: true },
    });
    return row.style as unknown as SiteStyle;
}

async function lockedRow(p: Promise<unknown>) {
    const err = await p.then(
        () => null,
        (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ForbiddenException);
    return (
        (err as ForbiddenException).getResponse() as {
            details: Record<string, unknown>;
        }
    ).details;
}

beforeAll(async () => {
    const c = catalogue();
    await writeCatalogueVersion(prisma, {
        version: V,
        catalog: c,
        goLiveAt: new Date(Date.now() - 60 * 60 * 1000),
        policy: "keep",
        planRows: planRows(c, V),
    });
    await prisma.pricingProviderPlan.updateMany({
        data: { status: "SYNCED", syncedAt: new Date() },
    });
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("free looks, typefaces and colourways (DEC-177)", () => {
    it("lets a free business pick Quiet, Folio and Live, and go back to Classic", async () => {
        const { owner, siteId } = await business("free");
        for (const look of ["quiet", "folio", "live"] as const) {
            await sites.updateStyle(owner, siteId, {
                ...(await stored(siteId)),
                look,
            });
            expect((await stored(siteId)).look).toBe(look);
        }
        const { look: _look, ...classic } = await stored(siteId);
        await sites.updateStyle(owner, siteId, classic);
        expect((await stored(siteId)).look).toBeUndefined();
    });

    it("refuses a paid typeface, then lets it go back to its own", async () => {
        const { owner, siteId } = await business("free");
        const before = await stored(siteId);

        expect(
            await lockedRow(
                sites.updateStyle(owner, siteId, {
                    ...before,
                    fontPair: "archivo",
                }),
            ),
        ).toMatchObject({ code: "MODULE_LOCKED", moduleId: "themes" });
        expect((await stored(siteId)).fontPair).toBe(OWN_PAIR);

        // The visitor's system font, then its template's own pair again.
        const { fontPair: _pair, ...system } = before;
        await sites.updateStyle(owner, siteId, system);
        expect((await stored(siteId)).fontPair).toBeUndefined();
        await sites.updateStyle(owner, siteId, {
            ...system,
            fontPair: OWN_PAIR,
        });
        expect((await stored(siteId)).fontPair).toBe(OWN_PAIR);
    });

    it("refuses another colourway, keeps its own, and lets colours change", async () => {
        const { owner, siteId } = await business("free");
        const before = await stored(siteId);
        expect(
            await lockedRow(
                sites.updateStyle(owner, siteId, {
                    ...before,
                    ...mauve.style,
                }),
            ),
        ).toMatchObject({ code: "MODULE_LOCKED", moduleId: "themes" });

        // Its own swatches are the merchant's colours, never paid.
        const { palette: _palette, type: _type, ...rest } = before;
        await sites.updateStyle(owner, siteId, {
            ...rest,
            colours: { ...rest.colours, accent: "teal" },
        });
        // And back into the colourway it was made in.
        await sites.updateStyle(owner, siteId, { ...rest, ...kesar.style });
        expect((await stored(siteId)).palette).toEqual(kesar.style.palette);
    });

    it("lets a plan with themes pick a paid typeface and colourway", async () => {
        const { owner, siteId } = await business("pro");
        await sites.updateStyle(owner, siteId, {
            ...(await stored(siteId)),
            ...mauve.style,
            fontPair: "archivo",
        });
        const after = await stored(siteId);
        expect(after.fontPair).toBe("archivo");
        expect(after.palette).toEqual(mauve.style.palette);
    });

    it("applies a free list published in admin at once", async () => {
        const { owner, siteId } = await business("free");
        const before = await stored(siteId);
        const paid = { ...before, ...mauve.style, fontPair: "archivo" };
        await lockedRow(sites.updateStyle(owner, siteId, paid));

        const operator = await prisma.user.create({
            data: { email: `${uniq("operator")}@example.com`, name: "Ana" },
        });
        const staff = {
            userId: operator.id,
            platformAdminId: "pa",
            roles: [],
            permissions: [],
            viaBootstrap: false,
        } as never;
        const draft = await admin.saveDraft(staff, {
            catalog: catalogue((c) => {
                c.freeStyles = {
                    looks: ["quiet", "folio", "live"],
                    fontPairs: ["archivo"],
                    colourways: ["salon:mauve"],
                };
            }) as never,
            revision: 0,
            baseVersion: V,
        });
        expect(draft.valid).toBe(true);
        await admin.publish(staff, {
            revision: draft.revision,
            policy: "keep",
            reason: "Free styles for everyone",
            idempotencyKey: uniq("key"),
        });
        await prisma.pricingProviderPlan.updateMany({
            data: { status: "SYNCED", syncedAt: new Date() },
        });

        await sites.updateStyle(owner, siteId, paid);
        const after = await stored(siteId);
        expect(after.fontPair).toBe("archivo");
        expect(after.palette).toEqual(mauve.style.palette);

        // And the editor's read says so.
        const read = await sites.getSite(owner, siteId);
        expect(read.styleAccess).toEqual({
            free: {
                looks: ["folio", "quiet", "live"],
                fontPairs: ["system", OWN_PAIR, "archivo"],
                colourways: ["kesar", "mauve"],
            },
            paidIncluded: false,
        });
    });

    it("refuses publishing a free id Saroh has no such style for", async () => {
        const operator = await prisma.user.create({
            data: { email: `${uniq("operator")}@example.com`, name: "Ben" },
        });
        const staff = {
            userId: operator.id,
            platformAdminId: "pa",
            roles: [],
            permissions: [],
            viaBootstrap: false,
        } as never;
        const live = await prisma.pricingCatalogVersion.findFirstOrThrow({
            orderBy: { version: "desc" },
            select: { version: true },
        });
        const draft = await admin.saveDraft(staff, {
            catalog: catalogue((c) => {
                c.freeStyles = {
                    looks: ["bold"],
                    fontPairs: [],
                    colourways: [],
                };
            }) as never,
            revision: 0,
            baseVersion: live.version,
        });
        await expect(
            admin.publish(staff, {
                revision: draft.revision,
                policy: "keep",
                reason: "A typo",
                idempotencyKey: uniq("key"),
            }),
        ).rejects.toMatchObject({
            status: 400,
            response: {
                details: {
                    errors: [
                        `freeStyles: "bold" isn't a look, typeface or colourway Saroh has`,
                    ],
                },
            },
        });
    });
});
