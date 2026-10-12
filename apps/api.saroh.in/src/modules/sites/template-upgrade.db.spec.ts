/**
 * DEC-141 against a real Postgres: moving an existing site to its
 * template's newest version (`template-upgrade.ts`).
 *
 * The rule under test is the owner's: every existing starter site gets the
 * new look, and nothing a merchant wrote or chose is destroyed.
 *
 * - A site nobody touched: its look, its footer and its pages become the
 *   new version's, in the draft.
 * - A site whose owner edited a page or chose a style: that page and that
 *   style are exactly as they were; it gains only what cannot conflict.
 * - Nothing goes live: the publication a site is serving is not replaced.
 * - Run twice, the second run does nothing. A dry run writes nothing.
 *
 * Every business here is its own, made by this file. The run is always
 * kept to one of them (`organizationId`), never the whole table: other
 * specs' sites are theirs.
 */
import { prisma } from "@saroh/database";
import { HERO_PROMPT } from "@saroh/templates";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditAction } from "../audit/audit.service";
import { EntitlementService } from "../billing/entitlement.service";
import { ModuleLifecycleService } from "../capabilities/module-lifecycle.service";
import { ModuleReadinessRegistry } from "../capabilities/readiness/module-readiness.registry";
import { ModuleSetupService } from "../capabilities/setup/module-setup.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FLAG_KEYS } from "../feature-flags/flags";
import { OWNER_NOTE_MESSAGE } from "./site-flags";
import { SitesService } from "./sites.service";
import {
    TEMPLATE_UPGRADE_ACTOR,
    upgradeSite,
    upgradeTemplateSites,
} from "./template-upgrade";

const tag = `${process.pid}x${Date.now().toString(36)}`;
let seq = 0;

const flags = new FeatureFlagService();
const entitlements = new EntitlementService();
const lifecycle = new ModuleLifecycleService(
    new ModuleReadinessRegistry(),
    prisma,
    undefined,
    flags,
);
const setup = new ModuleSetupService(lifecycle, entitlements, flags);
const sites = new SitesService(entitlements);

const HOURS = [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    open: "10:00",
    close: "18:00",
}));

async function business(name = "Asha Rao"): Promise<OrganizationContext> {
    seq += 1;
    const user = await prisma.user.create({
        data: { email: `up-${tag}-${seq}@example.com` },
    });
    const org = await prisma.organization.create({
        data: { name, slug: `up-${seq}-${tag}` },
    });
    return { organizationId: org.id, userId: user.id, role: "OWNER" };
}

/** A site as an earlier version made it. */
async function siteFrom(
    ctx: OrganizationContext,
    templateId: string,
    templateVersion: number,
    name = "Asha Rao",
): Promise<string> {
    const { siteId } = await sites.createFromTemplate(ctx, {
        name,
        templateId,
        templateVersion,
    });
    return siteId;
}

async function draft(siteId: string) {
    const pages = await prisma.page.findMany({
        where: { siteId },
        orderBy: { path: "asc" },
        select: {
            id: true,
            path: true,
            kind: true,
            hidden: true,
            versions: {
                where: { status: "DRAFT" },
                select: {
                    revision: true,
                    sections: {
                        orderBy: { order: "asc" },
                        select: {
                            key: true,
                            type: true,
                            contractVersion: true,
                            content: true,
                        },
                    },
                },
            },
        },
    });
    return pages.map((p) => ({
        id: p.id,
        path: p.path,
        kind: p.kind,
        hidden: p.hidden,
        revision: p.versions[0]?.revision,
        sections: p.versions.flatMap((v) => v.sections),
    }));
}

type Draft = Awaited<ReturnType<typeof draft>>;

const pageAt = (pages: Draft, path: string) => {
    const page = pages.find((p) => p.path === path);
    if (!page) throw new Error(`no page at ${path}`);
    return page;
};

function record(siteId: string) {
    return prisma.site.findUniqueOrThrow({
        where: { id: siteId },
        select: {
            templateId: true,
            templateVersion: true,
            templateStyleId: true,
            style: true,
            footer: true,
            currentPublicationId: true,
        },
    });
}

function upgradeEvents(siteId: string) {
    return prisma.auditEvent.findMany({
        where: { action: AuditAction.SiteTemplateUpgrade, targetId: siteId },
        orderBy: { createdAt: "asc" },
    });
}

/** Save a page with one section's content changed, as the editor does. */
async function edit(
    ctx: OrganizationContext,
    siteId: string,
    page: Draft[number],
    index: number,
    change: (content: Record<string, unknown>) => Record<string, unknown>,
) {
    await sites.replaceDraftSections(ctx, siteId, page.id, {
        sections: page.sections.map((s, i) => ({
            key: s.key,
            type: s.type,
            contractVersion: s.contractVersion,
            content:
                i === index
                    ? change(s.content as Record<string, unknown>)
                    : s.content,
        })),
    });
}

beforeAll(async () => {
    for (const key of FLAG_KEYS.filter((k) => k.startsWith("MODULE_"))) {
        await prisma.featureFlag.upsert({
            where: { key },
            create: { key, enabledByDefault: true },
            update: { enabledByDefault: true },
        });
    }
});

describe("a starter site nobody touched", () => {
    it("gets the new look, footer and pages in its draft, and its record moves with an audit event", async () => {
        const ctx = await business();
        const siteId = await siteFrom(ctx, "starter", 3);
        // As v3 left it: the note to the owner under the headline.
        expect(
            pageAt(await draft(siteId), "/").sections[0]?.content,
        ).toMatchObject({ subheading: HERO_PROMPT });
        expect(await record(siteId)).toMatchObject({
            templateVersion: 3,
            templateStyleId: null,
            style: null,
            footer: null,
        });

        const result = await upgradeSite(siteId);

        expect(result).toMatchObject({
            outcome: "upgraded",
            look: { style: "applied", footer: "applied" },
            counts: {
                pagesReplaced: 1,
                pagesMerged: 0,
                pagesCreated: 0,
                // v3's About was its stock paragraph: nothing true to put
                // there yet, so it leaves the site until the owner shows it.
                pagesHidden: 1,
                modulePagesAdded: 1,
            },
        });

        expect(await record(siteId)).toMatchObject({
            templateId: "starter",
            templateVersion: 4,
            templateStyleId: "stone",
            style: { fontPair: "source-serif-inter" },
            footer: { value: "", layout: "left" },
            // Nothing was published by it.
            currentPublicationId: null,
        });

        const pages = await draft(siteId);
        expect(pages.map((p) => p.path)).toEqual(["/", "/about", "/contact"]);
        const home = pageAt(pages, "/");
        expect(home.sections.map((s) => s.type)).toEqual(["hero", "enquiry"]);
        expect(home.sections[0]?.content).not.toHaveProperty("subheading");
        // The message form takes messages: it has its Form.
        expect(home.sections[1]?.content).toMatchObject({
            formId: expect.any(String),
        });
        // Hidden, not deleted: every section is still there.
        const about = pageAt(pages, "/about");
        expect(about.hidden).toBe(true);
        expect(about.sections).toHaveLength(2);
        expect(pageAt(pages, "/contact").kind).toBe("CONTACT");

        const events = await upgradeEvents(siteId);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            actorUserId: TEMPLATE_UPGRADE_ACTOR,
            organizationId: ctx.organizationId,
            targetType: "site",
            outcome: "SUCCESS",
            metadata: {
                from: "starter@3",
                to: "starter@4",
                style: "applied",
                footer: "applied",
                pagesReplaced: 1,
                pagesHidden: 1,
                modulePagesAdded: 1,
            },
        });

        // It can now go live: the note is gone.
        await expect(sites.publishSite(ctx, siteId)).resolves.toMatchObject({
            bypassed: false,
        });
    });

    it("is left alone by a second run", async () => {
        const ctx = await business();
        const siteId = await siteFrom(ctx, "starter", 3);
        await upgradeSite(siteId);
        const after = await draft(siteId);
        const recorded = await record(siteId);

        await expect(upgradeSite(siteId)).resolves.toEqual({
            outcome: "current",
        });
        const report = await upgradeTemplateSites({
            organizationId: ctx.organizationId,
        });
        expect(report).toMatchObject({
            sites: 1,
            upgraded: 0,
            alreadyCurrent: 1,
            failed: 0,
        });

        expect(await draft(siteId)).toEqual(after);
        expect(await record(siteId)).toEqual(recorded);
        expect(await upgradeEvents(siteId)).toHaveLength(1);
    });

    it("is only counted by a dry run", async () => {
        const ctx = await business();
        const siteId = await siteFrom(ctx, "starter", 3);
        const before = await draft(siteId);
        const recorded = await record(siteId);

        const report = await upgradeTemplateSites({
            dryRun: true,
            organizationId: ctx.organizationId,
        });
        expect(report).toMatchObject({
            dryRun: true,
            sites: 1,
            upgraded: 1,
            styleApplied: 1,
            footerApplied: 1,
            counts: { pagesReplaced: 1, pagesHidden: 1, modulePagesAdded: 1 },
            moves: { "starter@3 → starter@4": 1 },
        });

        expect(await draft(siteId)).toEqual(before);
        expect(await record(siteId)).toEqual(recorded);
        expect(await upgradeEvents(siteId)).toHaveLength(0);
        // The forms a real run would make were not made.
        expect(await prisma.form.count({ where: { siteId } })).toBe(0);

        // And the real run then does what the dry run said.
        const real = await upgradeTemplateSites({
            organizationId: ctx.organizationId,
        });
        expect(real.counts).toEqual(report.counts);
        expect(real.upgraded).toBe(1);
    });
});

describe("a starter site its owner has worked on", () => {
    it("keeps an edited page, a chosen style and the live site exactly as they were", async () => {
        const ctx = await business("Kesar Salon");
        const siteId = await siteFrom(ctx, "starter", 3, "Kesar Salon");
        const made = await draft(siteId);

        // The owner writes their own headline and line, publishes, and
        // then chooses an accent.
        await edit(ctx, siteId, pageAt(made, "/"), 0, (content) => ({
            ...content,
            heading: "Hair, done properly",
            subheading: "Cuts and colour in Indiranagar since 2014",
        }));
        const published = await sites.publishSite(ctx, siteId);
        await prisma.site.update({
            where: { id: siteId },
            data: { style: { colours: { accent: "teal" } } },
        });
        const before = await draft(siteId);
        const live = await prisma.publication.findUniqueOrThrow({
            where: { id: published.publicationId },
            select: { snapshot: true },
        });

        const result = await upgradeSite(siteId);
        expect(result).toMatchObject({
            outcome: "upgraded",
            look: { style: "kept", footer: "applied" },
            counts: {
                pagesReplaced: 0,
                pagesMerged: 0,
                sectionsAdded: 0,
                ownerNotesRemoved: 0,
                pagesHidden: 1,
                modulePagesAdded: 1,
            },
        });

        const after = await draft(siteId);
        // Home is byte for byte what the owner left: sections, keys, the
        // revision their editor holds.
        expect(pageAt(after, "/")).toEqual(pageAt(before, "/"));

        const recorded = await record(siteId);
        // Their accent, not a colourway; and no colourway recorded for it.
        expect(recorded.style).toEqual({ colours: { accent: "teal" } });
        expect(recorded).toMatchObject({
            templateVersion: 4,
            templateStyleId: null,
            // Still serving the version they published.
            currentPublicationId: published.publicationId,
        });
        expect(await prisma.publication.count({ where: { siteId } })).toBe(1);
        expect(
            await prisma.publication.findUniqueOrThrow({
                where: { id: published.publicationId },
                select: { snapshot: true },
            }),
        ).toEqual(live);

        // The new colourways are now theirs to choose in Website › Style.
        const read = await sites.getSite(ctx, siteId);
        expect(read.template).toEqual({
            id: "starter",
            version: 4,
            styleId: null,
        });
    });

    it("takes the note to the owner off a page they edited elsewhere, and adds the services they now offer", async () => {
        const ctx = await business("Kesar Salon");
        const siteId = await siteFrom(ctx, "starter", 3, "Kesar Salon");
        // Bookings on after the site: v3 followed no module, so nothing
        // was added.
        await setup.enable(ctx, "CRM", {});
        const bookings = await setup.enable(ctx, "APPOINTMENTS", {
            hours: HOURS,
            service: { name: "Haircut", durationMinutes: 45, price: "500" },
        });
        const made = await draft(siteId);
        expect(made.map((p) => p.path)).toEqual(["/", "/about"]);

        // They rewrote the second section and left the headline's line.
        await edit(ctx, siteId, pageAt(made, "/"), 1, () => ({
            format: "html",
            value: "<h2>What we do</h2><p>Cuts, colour and bridal work.</p>",
        }));
        const before = pageAt(await draft(siteId), "/");
        expect(before.sections[0]?.content).toMatchObject({
            subheading: HERO_PROMPT,
        });
        // While it is there, the site cannot go live.
        await expect(sites.publishSite(ctx, siteId)).rejects.toMatchObject({
            status: 409,
            response: {
                message: OWNER_NOTE_MESSAGE,
                details: { reason: "ownerNote" },
            },
        });

        const result = await upgradeSite(siteId);
        expect(result).toMatchObject({
            outcome: "upgraded",
            counts: {
                pagesReplaced: 0,
                pagesMerged: 1,
                sectionsAdded: 1,
                ownerNotesRemoved: 1,
                // Book and Contact.
                modulePagesAdded: 2,
                // About, which nobody touched.
                pagesHidden: 1,
            },
        });

        const after = await draft(siteId);
        expect(after.map((p) => p.path)).toEqual([
            "/",
            "/about",
            "/book",
            "/contact",
        ]);
        const home = pageAt(after, "/");
        expect(home.sections.map((s) => s.type)).toEqual([
            "hero",
            "servicesList",
            "richText",
            "richText",
        ]);
        // The business's own line where the note was.
        expect(home.sections[0]?.content).toMatchObject({
            heading: "Kesar Salon",
            subheading: "Haircut",
        });
        expect(home.sections[1]?.content).toMatchObject({
            serviceIds: [bookings.created.serviceId],
        });
        // Their paragraph, and the one they left, as they were, with
        // their keys.
        expect(home.sections[2]).toEqual(before.sections[1]);
        expect(home.sections[3]).toEqual(before.sections[2]);
        expect(home.sections[0]?.key).toBe(before.sections[0]?.key);
        // An open editor is told to reload rather than save over it.
        expect(home.revision).toBe((before.revision ?? 0) + 1);

        // v3's About was never touched, and its one paragraph was the
        // stock one. With one fact known of the business (it takes
        // bookings) v4 makes no About yet, so the page is hidden, whole.
        expect(pageAt(after, "/about")).toMatchObject({
            hidden: true,
            sections: pageAt(made, "/about").sections,
        });

        await expect(sites.publishSite(ctx, siteId)).resolves.toMatchObject({
            bypassed: false,
        });
    });
});

describe("the templates a person starts from", () => {
    it.each([
        ["personal", ["/", "/about", "/contact"]],
        ["portfolio", ["/", "/about", "/work"]],
    ])(
        "%s: the look is applied and every page is left as it was",
        async (templateId, paths) => {
            const ctx = await business();
            const siteId = await siteFrom(ctx, templateId, 1);
            const before = await draft(siteId);
            expect(before.map((p) => p.path)).toEqual(paths);

            const result = await upgradeSite(siteId);
            expect(result).toMatchObject({
                outcome: "upgraded",
                look: { style: "applied" },
                counts: {
                    pagesReplaced: 0,
                    pagesMerged: 0,
                    pagesCreated: 0,
                    pagesHidden: 0,
                    modulePagesAdded: 0,
                },
            });
            expect(await draft(siteId)).toEqual(before);
            expect(await record(siteId)).toMatchObject({
                templateId,
                templateVersion: 2,
                templateStyleId: "stone",
            });
        },
    );
});

describe("sites the upgrade does not know", () => {
    it("leaves a site with no template recorded exactly as it is", async () => {
        const ctx = await business();
        const siteId = await siteFrom(ctx, "starter", 3);
        // A site from before templates were recorded.
        await prisma.site.update({
            where: { id: siteId },
            data: { templateId: null, templateVersion: null },
        });
        const before = await draft(siteId);

        await expect(upgradeSite(siteId)).resolves.toEqual({
            outcome: "unknown",
        });
        expect(await draft(siteId)).toEqual(before);
        // Not on an upgraded template at all, so a run does not see it.
        expect(
            await upgradeTemplateSites({ organizationId: ctx.organizationId }),
        ).toMatchObject({ sites: 0, upgraded: 0 });
    });

    it("leaves a site on an industry template alone", async () => {
        const ctx = await business();
        const siteId = await siteFrom(ctx, "writing", 1);
        await expect(upgradeSite(siteId)).resolves.toEqual({
            outcome: "current",
        });
        expect(await upgradeEvents(siteId)).toHaveLength(0);
    });
});
