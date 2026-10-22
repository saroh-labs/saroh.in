import { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import type {
    InstantiatedTemplate,
    PagePlan,
    PlannedSection,
    StoredPage,
    TemplateContext,
    TemplateManifest,
    TemplateModulePageKind,
} from "@saroh/templates";
import {
    instantiateTemplate,
    planTemplateUpgrade,
    starterLine,
    templateModulePageKinds,
} from "@saroh/templates";

import type { PageActor } from "./module-page-create";
import { addModulePageIfMissing } from "./module-page-create";
import { MODULE_PAGE_DEFAULTS } from "./page-kinds";
import { newSectionKey } from "./site-create";
import type { SiteNavigation } from "./site-navigation";
import { NAVIGATION_MAX_ITEMS, parseSiteNavigation } from "./site-navigation";
import { recordedTemplate } from "./site-style-offer";
import { buildTemplateContext, withSectionForms } from "./site-template";

/**
 * Bringing a site's DRAFT up to what its template lays down for the
 * business now (starter v4, DEC-141). The rule is `planTemplateUpgrade`'s
 * (`@saroh/templates`): an untouched page becomes the template's, an edited
 * one keeps everything and gains only the bound sections it lacks. This
 * file reads the site, asks for the plan and writes it.
 *
 * Two callers:
 *
 * - **A module switched on after the site exists** ({@link
 *   syncSiteWithModules}, from the module switch's own transaction): the
 *   site gets the module's page and Home section, the ones a site made
 *   today would start with.
 * - **The upgrade of a site to its template's newest version**
 *   (`starter-upgrade.ts`).
 *
 * THE DRAFT ONLY. Nothing here publishes: a live site is its Publication,
 * and that changes only when somebody with `site:publish` puts a version
 * live (`live-pointer.ts`). So a customer never sees a page its owner has
 * not, and there is no kept page to stop serving. The owner sees the change
 * in the editor and as changes waiting to be published.
 *
 * Planning reads and applying writes are separate, so the upgrade's dry run
 * counts exactly what a real run would write.
 */

type Tx = Prisma.TransactionClient;
type ReadDb = Pick<Tx, "page">;

/** The site a plan is for. */
export interface SyncSite {
    id: string;
    name: string;
    organizationId: string;
}

/** One page's plan, with the rows it is about. */
type PlannedPage = PagePlan & {
    pageId?: string;
    /** The page's DRAFT version, when it has one. */
    versionId?: string;
};

/** Everything a sync would write to a site's pages. */
export interface SitePagesPlan {
    pages: PlannedPage[];
    /** Module pages the template asks for that the site lacks. */
    modulePages: TemplateModulePageKind[];
}

/** What a sync wrote, or would write. Counts only. */
export interface SyncCounts {
    pagesReplaced: number;
    pagesMerged: number;
    pagesCreated: number;
    pagesHidden: number;
    sectionsAdded: number;
    ownerNotesRemoved: number;
    modulePagesAdded: number;
}

export function emptyCounts(): SyncCounts {
    return {
        pagesReplaced: 0,
        pagesMerged: 0,
        pagesCreated: 0,
        pagesHidden: 0,
        sectionsAdded: 0,
        ownerNotesRemoved: 0,
        modulePagesAdded: 0,
    };
}

/** Whether a plan writes anything at all. */
export function changesAnything(counts: SyncCounts): boolean {
    return Object.values(counts).some((n) => n > 0);
}

/** What a plan will write, before it does. */
export function countsOf(plan: SitePagesPlan): SyncCounts {
    const counts = emptyCounts();
    for (const page of plan.pages) {
        switch (page.action) {
            case "replace":
                counts.pagesReplaced++;
                break;
            case "merge":
                counts.pagesMerged++;
                counts.sectionsAdded += page.added.length;
                counts.ownerNotesRemoved += page.notesRemoved;
                break;
            case "create":
                counts.pagesCreated++;
                break;
            case "hide":
                counts.pagesHidden++;
                break;
            case "keep":
                break;
        }
    }
    counts.modulePagesAdded = plan.modulePages.length;
    return counts;
}

/**
 * A template instantiated for a profile, or null when it cannot be (an old
 * version given a profile it never met). A candidate that cannot be made
 * simply is not one: the page then matches nothing and counts as edited.
 */
export function instantiated(
    template: TemplateManifest,
    context: TemplateContext,
): InstantiatedTemplate | null {
    try {
        return instantiateTemplate(template, context);
    } catch {
        return null;
    }
}

/**
 * Read the site's pages and plan them. Reads only.
 *
 * - `made`: what the template could have made the pages as (see
 *   `planTemplateUpgrade`).
 * - `to` and `context`: the template and the business now.
 */
export async function planSitePages(
    db: ReadDb,
    site: SyncSite,
    input: {
        to: TemplateManifest;
        made: readonly InstantiatedTemplate[];
        context: TemplateContext;
    },
): Promise<SitePagesPlan | null> {
    const next = instantiated(input.to, input.context);
    if (!next) return null;

    const rows = await db.page.findMany({
        where: { siteId: site.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
            id: true,
            path: true,
            isHome: true,
            hidden: true,
            kind: true,
            versions: {
                where: { status: "DRAFT" },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                    id: true,
                    revision: true,
                    sections: {
                        orderBy: { order: "asc" },
                        select: {
                            key: true,
                            type: true,
                            contractVersion: true,
                            content: true,
                            hidden: true,
                        },
                    },
                },
            },
        },
    });

    // Module pages are made and kept by their own path; only free-form
    // pages are the template's to plan.
    const free = rows.filter((row) => row.kind === "FREE");
    const stored: StoredPage[] = free.map((row) => ({
        path: row.path,
        isHome: row.isHome,
        hidden: row.hidden,
        // The draft's save count: 0 means nobody has saved it since it
        // was made. A page with no draft has none to read.
        ...(row.versions[0] ? { revision: row.versions[0].revision } : {}),
        sections: row.versions[0]?.sections ?? [],
    }));
    const byPath = new Map(free.map((row) => [row.path, row]));
    const pages: PlannedPage[] = planTemplateUpgrade({
        stored,
        made: input.made,
        next,
        line: starterLine(input.context),
    }).map((plan) => {
        const row = byPath.get(plan.path);
        return {
            ...plan,
            ...(row ? { pageId: row.id } : {}),
            ...(row?.versions[0] ? { versionId: row.versions[0].id } : {}),
        };
    });

    // A module page is added only where the site has none of the kind and
    // no page of the owner's holds its address (theirs stays).
    const kinds = new Set(rows.map((row) => row.kind as string));
    const paths = new Set(rows.map((row) => row.path));
    const modulePages = templateModulePageKinds(input.to, input.context).filter(
        (kind) =>
            !kinds.has(kind) && !paths.has(MODULE_PAGE_DEFAULTS[kind].path),
    );
    return { pages, modulePages };
}

/** Replace a page's draft sections with the plan's, in one go. */
async function writeSections(
    tx: Tx,
    actor: PageActor,
    site: SyncSite,
    page: { pageId: string; versionId?: string },
    sections: readonly PlannedSection[],
    /** Whether somebody had edited the page (a `merge`). */
    edited: boolean,
): Promise<void> {
    // A Form for an enquiry section the template has just laid down, as a
    // new site's gets one (`withEnquiryForms`).
    const ready = await withSectionForms(
        tx,
        {
            organizationId: site.organizationId,
            siteId: site.id,
            siteName: site.name,
        },
        sections,
    );
    const versionId =
        page.versionId ??
        (
            await tx.pageVersion.create({
                data: {
                    pageId: page.pageId,
                    organizationId: site.organizationId,
                    status: "DRAFT",
                    createdByUserId: actor.userId,
                },
                select: { id: true },
            })
        ).id;
    await tx.section.deleteMany({ where: { pageVersionId: versionId } });
    if (ready.length > 0) {
        await tx.section.createMany({
            data: ready.map((section, order) => ({
                pageVersionId: versionId,
                organizationId: site.organizationId,
                type: section.type,
                contractVersion: section.contractVersion,
                order,
                content: section.content as Prisma.InputJsonValue,
                hidden: section.hidden,
                // A section the page had keeps its key (and so its notes);
                // one the plan adds gets its own.
                key: section.key ?? newSectionKey(),
            })),
        });
    }
    /*
     * An edited page's revision moves with its sections (#285): an editor
     * tab open on the old draft is told to reload, and cannot save over the
     * section just added.
     *
     * An untouched page's does NOT. Its revision is the count of saves by
     * people, and 0 is the proof that nobody has edited it (`upgrade.ts`).
     * Counting Saroh's own write would make the page look edited from then
     * on: the next module switched on would add its section and leave the
     * hero's button asking for the old thing. The cost is the narrow case
     * of an editor open on that page at this moment: its next save puts
     * back the sections it was showing, which are the template's earlier
     * ones, and from then on the page is the owner's.
     */
    if (edited) {
        await tx.pageVersion.update({
            where: { id: versionId },
            data: { revision: { increment: 1 } },
        });
    }
}

/** Write a plan. Everything on `tx`: it lands whole or not at all. */
export async function applySitePages(
    tx: Tx,
    actor: PageActor,
    site: SyncSite,
    plan: SitePagesPlan,
): Promise<SyncCounts> {
    const counts = emptyCounts();
    const menuAdditions: string[] = [];
    for (const page of plan.pages) {
        if (page.action === "keep") continue;
        if (page.action === "create") {
            const ready = await withSectionForms(
                tx,
                {
                    organizationId: site.organizationId,
                    siteId: site.id,
                    siteName: site.name,
                },
                page.page.sections,
            );
            const created = await tx.page.create({
                select: { id: true },
                data: {
                    siteId: site.id,
                    organizationId: site.organizationId,
                    path: page.page.path,
                    title: page.page.title,
                    isHome: false,
                    versions: {
                        create: {
                            organizationId: site.organizationId,
                            status: "DRAFT",
                            createdByUserId: actor.userId,
                            sections: {
                                create: ready.map((section) => ({
                                    organizationId: site.organizationId,
                                    key: newSectionKey(),
                                    type: section.type,
                                    contractVersion: section.contractVersion,
                                    order: section.order,
                                    content:
                                        section.content as Prisma.InputJsonValue,
                                })),
                            },
                        },
                    },
                },
            });
            if (page.page.inMenu ?? true) menuAdditions.push(created.id);
            counts.pagesCreated++;
            continue;
        }
        // Planned from a page that was read, so its row is known.
        if (!page.pageId) continue;
        if (page.action === "hide") {
            await tx.page.update({
                where: { id: page.pageId },
                data: { hidden: true },
            });
            counts.pagesHidden++;
            continue;
        }
        await writeSections(
            tx,
            actor,
            site,
            { pageId: page.pageId, versionId: page.versionId },
            page.sections,
            page.action === "merge",
        );
        if (page.action === "replace") {
            counts.pagesReplaced++;
        } else {
            counts.pagesMerged++;
            counts.sectionsAdded += page.added.length;
            counts.ownerNotesRemoved += page.notesRemoved;
        }
    }

    for (const kind of plan.modulePages) {
        // The plan asked whether the business has the module, on this
        // client: the page's own gate is not asked again (`known`).
        const added = await addModulePageIfMissing(tx, actor, site, kind, {
            known: true,
        });
        if (added) counts.modulePagesAdded++;
    }

    if (menuAdditions.length > 0) {
        await addToMenu(tx, site.id, menuAdditions);
    }
    return counts;
}

/**
 * Put new free-form pages at the end of the site's menu, where it has one.
 * (Module pages need no entry: the menu lists them by themselves.) A site
 * with no menu, or a full one, is left alone: the owner adds the page in
 * Settings › Menu.
 */
export async function addToMenu(
    tx: Tx,
    siteId: string,
    pageIds: readonly string[],
): Promise<void> {
    const site = await tx.site.findUnique({
        where: { id: siteId },
        select: { navigation: true },
    });
    let menu: SiteNavigation | null;
    try {
        menu = parseSiteNavigation(site?.navigation);
    } catch {
        return;
    }
    if (!menu) return;
    const listed = new Set(menu.items.map((item) => item.pageId));
    const items = [
        ...menu.items,
        ...pageIds
            .filter((pageId) => !listed.has(pageId))
            .map((pageId) => ({ pageId })),
    ].slice(0, NAVIGATION_MAX_ITEMS);
    if (items.length === menu.items.length) return;
    await tx.site.update({
        where: { id: siteId },
        data: {
            navigation: { items },
        },
    });
}

/**
 * The modules a template's pages depend on (`starter-v4.ts`). Switching any
 * other on changes nothing a template lays down, so nothing is read.
 */
const FOLLOWED_MODULES = new Set<string>([
    "COMMERCE",
    "APPOINTMENTS",
    "PAYMENTS",
    "CLASS_PACKS",
]);

/**
 * A module was switched on (on `tx`, the switch's own transaction): the
 * business's website gains what its template lays down for a business with
 * that module, if its template is one that follows the modules
 * (`modulePages`: the starter from v4). Its page (Shop, Book, Prices) is
 * added where the site has none, and Home gets the section a site made
 * today would have.
 *
 * "What the template made before" is the template for the same business
 * with this one module read as off, so a Home nobody has edited becomes
 * exactly the Home a new site would get, and an edited one keeps every
 * section and gains only the bound one.
 *
 * Null when there is nothing to do: no website, a template that does not
 * follow the modules, or a site made before templates were recorded.
 */
export async function syncSiteWithModules(
    tx: Tx,
    actor: PageActor,
    switchedOn: string,
): Promise<SyncCounts | null> {
    const following = await followingSite(tx, actor, switchedOn);
    return following
        ? syncFollowingSite(tx, actor, following, switchedOn)
        : null;
}

/** The business's website and its template, when the template follows modules. */
interface FollowingSite {
    site: SyncSite;
    template: TemplateManifest;
}

/** The site a module switch may change, or null (see above). Reads only. */
async function followingSite(
    tx: Pick<Tx, "site">,
    actor: PageActor,
    switchedOn: string,
): Promise<FollowingSite | null> {
    if (!FOLLOWED_MODULES.has(switchedOn)) return null;
    const row = await tx.site.findFirst({
        where: { organizationId: actor.organizationId, deletedAt: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
            id: true,
            name: true,
            templateId: true,
            templateVersion: true,
        },
    });
    if (!row) return null;
    const template = recordedTemplate(row);
    if (!template || (template.modulePages ?? []).length === 0) return null;
    return {
        template,
        site: {
            id: row.id,
            name: row.name,
            organizationId: actor.organizationId,
        },
    };
}

const logger = new Logger("TemplateSync");

/**
 * {@link syncSiteWithModules} for the module switch itself
 * (`ModuleLifecycleService.enable`): it must never be the reason a module
 * cannot be switched on. The site's changes are made inside a savepoint, so
 * if anything in them fails they are undone alone, the switch still
 * commits, and the failure is logged (by its kind: an error's message can
 * quote a business's own words). The business then has its module and a
 * site that did not gain the page, which it can add from Website.
 */
export async function syncSiteAfterModuleSwitch(
    tx: Tx,
    actor: PageActor,
    switchedOn: string,
): Promise<void> {
    const following = await followingSite(tx, actor, switchedOn);
    if (!following) return;
    await tx.$executeRaw`SAVEPOINT template_sync`;
    try {
        await syncFollowingSite(tx, actor, following, switchedOn);
        await tx.$executeRaw`RELEASE SAVEPOINT template_sync`;
    } catch (error) {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT template_sync`;
        logger.error(
            `site not brought up to its template after ${switchedOn} was switched on: ${
                error instanceof Error ? error.name : "error"
            }`,
        );
    }
}

async function syncFollowingSite(
    tx: Tx,
    actor: PageActor,
    { site, template }: FollowingSite,
    switchedOn: string,
): Promise<SyncCounts | null> {
    const read = { db: tx, siteId: site.id };
    const context = await buildTemplateContext(actor.organizationId, read);
    const before = await buildTemplateContext(actor.organizationId, {
        ...read,
        without: switchedOn,
    });
    const made = instantiated(template, before);
    const plan = await planSitePages(tx, site, {
        to: template,
        made: made ? [made] : [],
        context,
    });
    if (!plan) return null;
    return applySitePages(tx, actor, site, plan);
}
