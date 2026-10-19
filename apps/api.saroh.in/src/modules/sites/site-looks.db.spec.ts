/**
 * A look per site (DEC-172, plan U2), against a real Postgres: the
 * `SITE_LOOKS` flag gates choosing a look, never keeping or clearing one;
 * a look saves to the draft and a publish carries it, with safe colours;
 * a new site starts in its industry's look while the flag is on; and
 * another business's site can't be touched.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => {
    const actual = jest.requireActual<typeof import("../../env")>("../../env");
    // The page cache on, so a publish queues its revalidation (#863). Not
    // in RLS mode: the revalidation job is written without an organization,
    // which the Job table's policy refuses inside an organization's context
    // (a gap of the page cache's, reported with this unit, not a look's).
    const rls = ["1", "on", "true"].includes(
        (process.env.TEST_RLS ?? "").trim().toLowerCase(),
    );
    return {
        ...actual,
        env: new Proxy(actual.env, {
            get: (target, key) =>
                key === "SITE_PAGE_CACHE" && !rls
                    ? "on"
                    : (target as Record<string | symbol, unknown>)[key],
        }),
    };
});

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { SITE_PAGES_REVALIDATE_TYPE } from "./page-cache-revalidate";
import { LOOK_NOT_AVAILABLE } from "./site-looks";
import { defaultSiteStyle } from "./site-style";
import { SitesService } from "./sites.service";

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

const tag = `${process.pid}x${Date.now().toString(36)}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

async function business(): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name: "Prana Yoga", slug: uniq("looks") },
        select: { id: true },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("looks-user")}@example.com` },
        select: { id: true },
    });
    return { organizationId: org.id, userId: user.id, role: "OWNER" };
}

/** `SITE_LOOKS` for one business, as admin → Flags sets it. */
async function looks(organizationId: string, enabled: boolean) {
    await prisma.featureFlag.upsert({
        where: { key: "SITE_LOOKS" },
        update: {},
        create: { key: "SITE_LOOKS", enabledByDefault: false },
    });
    await prisma.featureFlagOverride.upsert({
        where: {
            flagKey_organizationId: { flagKey: "SITE_LOOKS", organizationId },
        },
        update: { enabled },
        create: { flagKey: "SITE_LOOKS", organizationId, enabled },
    });
}

async function storedStyle(siteId: string) {
    const site = await prisma.site.findUniqueOrThrow({
        where: { id: siteId },
        select: { style: true },
    });
    return site.style as { look?: string } | null;
}

/** A Classic site, made with the flag off (writing has no colourways). */
async function classicSite(ctx: OrganizationContext) {
    return sites.createFromTemplate(ctx, {
        name: "Prana Yoga",
        templateId: "writing",
    });
}

async function refusal(promise: Promise<unknown>) {
    const error = await promise.then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as {
        details?: { field?: string; code?: string };
    };
}

describe("choosing a look (SITE_LOOKS)", () => {
    it("refuses setting a look on a Classic site while the flag is off", async () => {
        const ctx = await business();
        const { siteId } = await classicSite(ctx);

        const body = await refusal(
            sites.updateStyle(ctx, siteId, {
                ...defaultSiteStyle(),
                look: "quiet",
            }),
        );
        expect(body.details).toEqual({
            field: "look",
            code: LOOK_NOT_AVAILABLE,
        });
        expect(await storedStyle(siteId)).toBeNull();
    });

    it("refuses a look that isn't one, flag or not", async () => {
        const ctx = await business();
        await looks(ctx.organizationId, true);
        const { siteId } = await classicSite(ctx);
        const body = await refusal(
            sites.updateStyle(ctx, siteId, { look: "corner" }),
        );
        expect(body.details?.field).toBe("look");
    });

    it("keeps or clears a look after the flag goes off, and refuses another", async () => {
        const ctx = await business();
        const { siteId } = await classicSite(ctx);
        await looks(ctx.organizationId, true);
        await sites.updateStyle(ctx, siteId, {
            ...defaultSiteStyle(),
            look: "quiet",
        });
        await looks(ctx.organizationId, false);

        // A new colourway, the look kept: saved.
        const kept = await sites.updateStyle(ctx, siteId, {
            ...defaultSiteStyle(),
            colours: { ...defaultSiteStyle().colours, accent: "teal" },
            look: "quiet",
        });
        expect(kept.style.look).toBe("quiet");
        expect(await storedStyle(siteId)).toMatchObject({
            look: "quiet",
            colours: { accent: "teal" },
        });

        // Another look: refused.
        const body = await refusal(
            sites.updateStyle(ctx, siteId, {
                ...defaultSiteStyle(),
                look: "folio",
            }),
        );
        expect(body.details?.code).toBe(LOOK_NOT_AVAILABLE);

        // Back to Classic, by leaving it out or by null: saved.
        const cleared = await sites.updateStyle(ctx, siteId, {
            ...defaultSiteStyle(),
            look: null,
        });
        expect(cleared.style.look).toBeUndefined();
        expect(await storedStyle(siteId)).not.toHaveProperty("look");
    });

    it("saves a look to the draft and a publish carries it, with safe colours", async () => {
        const ctx = await business();
        const { siteId } = await classicSite(ctx);
        await sites.publishSite(ctx, siteId);
        await looks(ctx.organizationId, true);

        // A bright accent: made readable, never refused.
        await sites.updateStyle(ctx, siteId, {
            ...defaultSiteStyle(),
            colours: { ...defaultSiteStyle().colours, accent: "rose" },
            look: "folio",
        });
        const view = await sites.getSite(ctx, siteId);
        expect(view.style.look).toBe("folio");
        expect(view.looksAvailable).toBe(true);
        // Not live until published.
        expect(view.pendingSiteChanges).toEqual(
            expect.arrayContaining(["style"]),
        );

        await sites.publishSite(ctx, siteId);
        const live = await prisma.publication.findFirstOrThrow({
            where: { siteId },
            orderBy: { publishedAt: "desc" },
            select: { snapshot: true },
        });
        const snapshot = live.snapshot as {
            site: {
                look?: string;
                style: { look?: string };
                styleVariables: Record<string, string>;
            };
        };
        expect(snapshot.site.look).toBe("folio");
        expect(snapshot.site.style.look).toBe("folio");
        expect(snapshot.site.styleVariables["--site-accent-text"]).toBeTruthy();
        expect(snapshot.site.styleVariables["--site-rule"]).toBeTruthy();

        // The publish told the page cache (#863).
        if (isRlsTestMode()) return;
        const jobs = await prisma.job.findMany({
            where: { type: SITE_PAGES_REVALIDATE_TYPE },
            select: { payload: true },
        });
        expect(
            jobs.some((j) =>
                (j.payload as { siteIds?: string[] }).siteIds?.includes(siteId),
            ),
        ).toBe(true);
    });

    it("publishes a Classic site with no look at all", async () => {
        const ctx = await business();
        const { siteId } = await classicSite(ctx);
        await sites.publishSite(ctx, siteId);
        const live = await prisma.publication.findFirstOrThrow({
            where: { siteId },
            select: { snapshot: true },
        });
        const site = (live.snapshot as { site: Record<string, unknown> }).site;
        expect(site).not.toHaveProperty("look");
        expect(site.styleVariables).not.toHaveProperty("--site-accent-text");
        expect((await sites.getSite(ctx, siteId)).looksAvailable).toBe(false);
    });

    it("never touches another business's site", async () => {
        const ours = await business();
        const theirs = await business();
        await looks(ours.organizationId, true);
        const { siteId } = await classicSite(theirs);

        await expect(
            sites.updateStyle(ours, siteId, {
                ...defaultSiteStyle(),
                look: "quiet",
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(await storedStyle(siteId)).toBeNull();
    });
});

describe("a new site's look (R10)", () => {
    it.each([
        ["salon", "quiet"],
        ["bakery", "quiet"],
        ["gym", "live"],
    ])("starts a %s site %s while the flag is on", async (templateId, look) => {
        const ctx = await business();
        await looks(ctx.organizationId, true);
        const { siteId } = await sites.createFromTemplate(ctx, {
            name: "Prana Yoga",
            templateId,
        });
        const style = await storedStyle(siteId);
        expect(style?.look).toBe(look);
        // In the template's own colourway still.
        expect(style).toHaveProperty("palette");
    });

    it("starts a site from a template without colourways in its look", async () => {
        const ctx = await business();
        await looks(ctx.organizationId, true);
        const { siteId } = await classicSite(ctx);
        expect(await storedStyle(siteId)).toMatchObject({
            ...defaultSiteStyle(),
            look: "quiet",
        });
    });

    it("starts every site Classic while the flag is off", async () => {
        const ctx = await business();
        const { siteId } = await sites.createFromTemplate(ctx, {
            name: "Prana Yoga",
            templateId: "gym",
        });
        expect(await storedStyle(siteId)).not.toHaveProperty("look");
    });
});
