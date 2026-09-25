import type { Prisma } from "@prisma/client";
import { hashPassword as hashPasswordUntyped } from "better-auth/crypto";

import { parseSectionContentOrThrow } from "@saroh/block-contract";
import type { SeedSection, SeedSite } from "./data";
import { SEED_PREFIX, SEEDED_STYLE_VARIABLES } from "./data";

/**
 * Small pieces both seeds share: the base Northwind seed (`run.ts`) and the
 * showcase layered on top of it (`showcase/`). Kept here rather than copied so
 * the two cannot drift on how an id is formed, how a site is published or how
 * an analytics rollup is shaped.
 */

/**
 * better-auth's declarations do not give this a resolvable signature from this
 * package, so the contract we depend on is stated once here rather than letting
 * an unknown type spread through every call site.
 */
export const hashPassword = hashPasswordUntyped as (
    password: string,
) => Promise<string>;

export const id = (...parts: (string | number)[]) =>
    `${SEED_PREFIX}${parts.join("_")}`;

export const DAY_MS = 86_400_000;

/** `dayOffset` days from `now`, at `hour` o'clock in the machine's zone. */
export const at = (now: Date, dayOffset: number, hour = 9) => {
    const d = new Date(now.getTime() + dayOffset * DAY_MS);
    d.setHours(hour, 0, 0, 0);
    return d;
};

/** The UTC midnight of `when` — the day bucket the aggregate job keys on. */
export const utcDay = (when: Date) =>
    new Date(
        Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()),
    );

/**
 * A deterministic 0..1 from an integer.
 *
 * The analytics series needs day-to-day variation — a flat line is not what a
 * real site's traffic looks like — but `Math.random` would make every re-run
 * rewrite every count, so a fixture that is supposed to be idempotent would
 * churn the database on each invocation. Hashing the day index gives the same
 * jagged series every time.
 */
export const noise = (n: number): number => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
};

export const emailFor = (first: string, last: string) =>
    `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "") + "@example.com";

export type Db = typeof import("../client").prisma;

// --- Website ------------------------------------------------------------

/** Where each row of one seeded site is written. */
export interface SiteWriteIds {
    site: string;
    page: (p: number) => string;
    pageVersion: (p: number) => string;
    section: (p: number, n: number) => string;
    sectionKey: (p: number, n: number) => string;
    form: (p: number, n: number) => string;
    publication: string;
}

export interface SiteWriteOptions {
    fixture: SeedSite;
    orgId: string;
    userId: string;
    now: Date;
    ids: SiteWriteIds;
    /** The pipeline an enquiry form files its leads into, if any. */
    pipelineId: string | null;
    /** A fixture service index, resolved to the Service row it names. */
    serviceId: (index: number) => string;
    footer: { format: "text"; value: string };
}

/**
 * Write one site: its pages, their DRAFT versions and sections, and — when the
 * fixture is published — a Publication and the live pointer.
 *
 * Two things here mirror the product rather than inventing a shape. Publishing
 * snapshots FROM a page's DRAFT version and never flips that version's status,
 * so every seeded PageVersion stays DRAFT; and the Publication snapshot is
 * assembled the way `SitesService.publishSite` assembles it — pages sorted by
 * path, sections in order, content already contract-normalized — because the
 * public renderer reads only that JSON and would render whatever shape we put
 * there, correct or not.
 *
 * Section content goes through `parseSectionContentOrThrow`, the same contract
 * the editor and publish enforce, so a fixture can never persist a section the
 * product itself would reject.
 *
 * @returns the site id.
 */
export async function writeSite(
    prisma: Db,
    options: SiteWriteOptions,
): Promise<string> {
    const { fixture, orgId, userId, now, ids } = options;
    const createdAt = at(now, -fixture.createdDaysAgo, 11);

    const site = await prisma.site.upsert({
        where: {
            organizationId_slug: { organizationId: orgId, slug: fixture.slug },
        },
        update: { name: fixture.name, subdomain: fixture.subdomain },
        create: {
            id: ids.site,
            organizationId: orgId,
            name: fixture.name,
            slug: fixture.slug,
            subdomain: fixture.subdomain,
            createdAt,
        },
    });

    const snapshotPages: {
        path: string;
        title: string;
        isHome: boolean;
        // Written inline rather than as a named interface: the snapshot goes
        // in as JSON, and only an object literal type carries the implicit
        // index signature `InputJsonValue` asks for.
        sections: {
            type: string;
            contractVersion: number;
            content: Prisma.InputJsonValue;
        }[];
    }[] = [];

    for (let p = 0; p < fixture.pages.length; p++) {
        const pageFixture = fixture.pages[p];

        const page = await prisma.page.upsert({
            where: { siteId_path: { siteId: site.id, path: pageFixture.path } },
            update: { title: pageFixture.title },
            create: {
                id: ids.page(p),
                siteId: site.id,
                organizationId: orgId,
                path: pageFixture.path,
                title: pageFixture.title,
                isHome: pageFixture.isHome ?? false,
                createdAt,
            },
        });

        const version = await prisma.pageVersion.upsert({
            where: { id: ids.pageVersion(p) },
            update: { status: "DRAFT" },
            create: {
                id: ids.pageVersion(p),
                pageId: page.id,
                organizationId: orgId,
                status: "DRAFT",
                createdByUserId: userId,
                createdAt,
            },
        });

        /*
         * Clear whatever an editor left on this draft before rewriting it.
         *
         * Saving a draft REPLACES its sections — `replaceDraftSections`
         * deletes the rows and writes new ones with fresh ids — so the moment
         * anybody opened the seeded site in the editor, this page version held
         * sections the seed does not own. The upserts below are keyed by
         * seeded id, so they tried to INSERT, and the `(pageVersionId, key)`
         * unique constraint refused it: re-seeding failed for any developer
         * who had used the product, which is everyone the fixture is for.
         *
         * Scoped to this seeded version and to rows without the seed prefix.
         * Restoring the fixture is exactly what re-running the seed means;
         * nothing outside a seeded page version is touched.
         */
        await prisma.section.deleteMany({
            where: {
                pageVersionId: version.id,
                id: { not: { startsWith: SEED_PREFIX } },
            },
        });

        const snapshotSections: (typeof snapshotPages)[number]["sections"] = [];

        for (let n = 0; n < pageFixture.sections.length; n++) {
            const seedSection = pageFixture.sections[n];
            const content = await resolveSectionContent(
                prisma,
                options,
                site.id,
                ids.form(p, n),
                seedSection,
                createdAt,
            );
            const normalized = parseSectionContentOrThrow(
                seedSection.type,
                1,
                content,
            ) as Prisma.InputJsonValue;

            await prisma.section.upsert({
                where: { id: ids.section(p, n) },
                update: { order: n, content: normalized },
                create: {
                    id: ids.section(p, n),
                    pageVersionId: version.id,
                    organizationId: orgId,
                    type: seedSection.type,
                    contractVersion: 1,
                    order: n,
                    content: normalized,
                    // Deterministic, like every other seeded id: re-running
                    // the seed must not re-key the sections, or the notes
                    // pinned to them would all come back orphaned.
                    key: ids.sectionKey(p, n),
                    createdAt,
                },
            });

            snapshotSections.push({
                type: seedSection.type,
                contractVersion: 1,
                content: normalized,
            });
        }

        snapshotPages.push({
            path: pageFixture.path,
            title: pageFixture.title,
            isHome: pageFixture.isHome ?? false,
            sections: snapshotSections,
        });
    }

    if (!fixture.published) return site.id;

    // Published a while after the site was created — a merchant writes the
    // pages first. A draft site skips this block entirely, which is the whole
    // of what "draft" means here: no Publication, no live pointer.
    const publishedAt = at(
        now,
        -Math.max(1, Math.round(fixture.createdDaysAgo / 6)),
        16,
    );
    const publication = await prisma.publication.upsert({
        where: { id: ids.publication },
        // A Publication is immutable and append-only — republishing inserts a
        // new row. So a re-run must not rewrite this one.
        update: {},
        create: {
            id: ids.publication,
            siteId: site.id,
            organizationId: orgId,
            snapshot: {
                /*
                 * SHAPED LIKE A REAL PUBLISH (#265).
                 *
                 * This used to carry `name` and `slug` and nothing else, which
                 * is a snapshot `buildSnapshot` would never write. A
                 * publication is self-contained by design — the renderer reads
                 * it and resolves nothing — so the missing fields did not
                 * degrade, they fell through to a different set of defaults
                 * inside the renderer. The seeded site rendered on SiteTheme's
                 * hardcoded stone palette, or a black ground on a machine whose
                 * OS prefers dark, while the editor showed the resolved
                 * defaults.
                 */
                site: {
                    name: fixture.name,
                    slug: fixture.slug,
                    styleVariables: { ...SEEDED_STYLE_VARIABLES },
                    footer: { ...options.footer },
                    /*
                     * A menu over this site's own published pages, in the
                     * order the fixture lists them. Publish resolves page ids
                     * to paths and drops hidden pages; the fixture has the
                     * paths already, so it writes the resolved shape.
                     *
                     * A single-page site gets no menu, which is what
                     * `resolveSiteNavigation` produces for a merchant who has
                     * not built one — and what `SiteHeader` is designed
                     * around: with no menu it centres the site name.
                     */
                    navigation:
                        snapshotPages.length > 1
                            ? snapshotPages.map((page) => ({
                                  label: page.title,
                                  href: page.path,
                              }))
                            : [],
                },
                pages: [...snapshotPages].sort((a, b) =>
                    a.path.localeCompare(b.path),
                ),
                publishedAt: publishedAt.toISOString(),
            },
            // The Site does not record which template produced it; publish
            // stamps the starter template's identity, so the fixture does too.
            templateId: "starter",
            templateVersion: 1,
            publishedByUserId: userId,
            publishedAt,
        },
    });

    await prisma.site.update({
        where: { id: site.id },
        data: { currentPublicationId: publication.id },
    });

    return site.id;
}

/**
 * Turn a fixture section into the content the contract expects.
 *
 * `enquiry`, `booking` and `servicesList` are the ones that need work: each
 * points at another row by id, and the editor is what normally creates that
 * link. The enquiry's backing Form is written here (the public submit endpoint
 * validates against it, so a section without one is a form nobody can send),
 * and the booking and services list resolve to Services the appointments
 * fixture already seeded.
 */
async function resolveSectionContent(
    prisma: Db,
    options: SiteWriteOptions,
    siteId: string,
    formId: string,
    section: SeedSection,
    createdAt: Date,
): Promise<unknown> {
    if (section.type === "enquiry") {
        const form = await prisma.form.upsert({
            where: { id: formId },
            update: { name: section.form.name },
            create: {
                id: formId,
                organizationId: options.orgId,
                siteId,
                name: section.form.name,
                fields: section.form.fields as unknown as Prisma.InputJsonValue,
                pipelineId: options.pipelineId,
                createdAt,
            },
        });
        return {
            ...section.content,
            formId: form.id,
            fields: section.form.fields,
        };
    }

    if (section.type === "booking") {
        return {
            ...section.content,
            serviceId: options.serviceId(section.service),
        };
    }

    if (section.type === "servicesList") {
        return {
            ...section.content,
            serviceIds: section.services.map(options.serviceId),
        };
    }

    return section.content;
}

// --- Analytics ----------------------------------------------------------

export interface AnalyticsRow {
    id: string;
    date: Date;
    type: string;
    dimension: string;
    dimensionValue: string;
    count: number;
    uniqueCount: number;
}

export interface AnalyticsShape {
    now: Date;
    days: number;
    paths: readonly { path: string; weight: number }[];
    /** The id for one day's row, e.g. `id("agg", iso, key)`. */
    idFor: (iso: string, key: string) => string;
    /** Weekday views on the oldest day, and how many more per day after. */
    trendBase: number;
    trendSlope: number;
    /** Weekend traffic as a share of a weekday's. */
    weekendFactor: number;
    /** Enquiries per view, before noise. */
    enquiryRate: number;
    /** Paid orders per view, before noise; ignored when `paidOrders` is set. */
    orderRate: number;
    /** The actual paid orders per UTC day (ISO date), when they are known. */
    paidOrders?: ReadonlyMap<string, number>;
    /** The actual enquiries per UTC day, when they are known. */
    enquiries?: ReadonlyMap<string, number>;
    /** Shifts the noise so two businesses do not share one jagged line. */
    noiseOffset?: number;
}

/**
 * Daily rollups in the shape the aggregate job writes them.
 *
 * The dashboard reads ONLY pre-computed `AnalyticsDailyAggregate` rows, and it
 * only ever reads the org-wide ones (`siteId = ""`): the undimensioned rows are
 * the headline totals and the time series, and the `path`-dimensioned rows are
 * the top-pages table. Every day's path counts sum to exactly that day's views,
 * so the top-pages table can never total more than the headline it sits under.
 */
export function buildAnalyticsRows(shape: AnalyticsShape): AnalyticsRow[] {
    const today = utcDay(shape.now);
    const o = shape.noiseOffset ?? 0;
    const rows: AnalyticsRow[] = [];

    for (let i = 0; i < shape.days; i++) {
        // i = 0 is the oldest day, so the slow upward trend runs forwards.
        const date = new Date(today.getTime() - (shape.days - 1 - i) * DAY_MS);
        const iso = date.toISOString().slice(0, 10);
        const weekday = date.getUTCDay();
        const weekend = weekday === 0 || weekday === 6;

        const trend = shape.trendBase + Math.round(i * shape.trendSlope);
        const views = Math.max(
            11,
            Math.round(
                trend *
                    (weekend ? shape.weekendFactor : 1) *
                    (0.82 + noise(i + o) * 0.36),
            ),
        );
        const uniques = Math.round(views * (0.62 + noise(i + o + 500) * 0.1));
        const enquiries = shape.enquiries
            ? (shape.enquiries.get(iso) ?? 0)
            : Math.floor(
                  views * shape.enquiryRate * (0.4 + noise(i + o + 901) * 1.6),
              );
        const orders = shape.paidOrders
            ? (shape.paidOrders.get(iso) ?? 0)
            : Math.floor(
                  views * shape.orderRate * (0.3 + noise(i + o + 1301) * 1.8),
              );

        const row = (
            key: string,
            type: string,
            dimension: string,
            dimensionValue: string,
            count: number,
            uniqueCount: number,
        ) => {
            // The job writes a bucket only for events that happened; a quiet
            // day leaves no row at all rather than a row of zeroes.
            if (count > 0) {
                rows.push({
                    id: shape.idFor(iso, key),
                    date,
                    type,
                    dimension,
                    dimensionValue,
                    count,
                    uniqueCount,
                });
            }
        };

        row("views", "site.view", "", "", views, uniques);
        // Enquiries and paid orders are produced server-side, with no visitor
        // hash to count distinct — so their `uniqueCount` is 0, as it is in
        // production. The dashboard reads only `count` for these two.
        row("enquiries", "enquiry.submitted", "", "", enquiries, 0);
        row("orders", "order.paid", "", "", orders, 0);

        let assigned = 0;
        const perPath = shape.paths.map((p) => {
            const count = Math.floor(views * p.weight);
            assigned += count;
            return { path: p.path, count };
        });
        // "/" absorbs the rounding remainder, so the paths add up to `views`.
        perPath[0].count += views - assigned;

        for (const p of perPath) {
            row(
                `path${p.path.replace(/\W+/g, "-")}`,
                "site.view",
                "path",
                p.path,
                p.count,
                Math.min(p.count, Math.max(1, Math.round(p.count * 0.72))),
            );
        }
    }
    return rows;
}

// --- Posts --------------------------------------------------------------

/**
 * Make a PUBLISHED post actually live (#232): write its Publication and point
 * the post at it, or the dev data shows a state the product itself cannot
 * produce. Skipped when the post already has one — a Publication is immutable
 * and a re-run must not append another.
 */
export async function publishSeedPost(
    prisma: Db,
    options: {
        post: {
            id: string;
            title: string;
            slug: string;
            excerpt: string | null;
            content: string;
            image: string | null;
            featured: boolean;
            publishedAt: Date | null;
            currentPublicationId: string | null;
        };
        orgId: string;
        siteId: string;
        publicationId: string;
    },
): Promise<void> {
    const { post } = options;
    if (post.currentPublicationId) return;
    const publishedAt = post.publishedAt ?? new Date();
    const publication = await prisma.publication.create({
        data: {
            id: options.publicationId,
            siteId: options.siteId,
            organizationId: options.orgId,
            postId: post.id,
            path: `/blog/${post.slug}`,
            snapshot: {
                post: {
                    title: post.title,
                    slug: post.slug,
                    excerpt: post.excerpt,
                    content: post.content,
                    image: post.image,
                    featured: post.featured,
                    category: null,
                    author: null,
                    publishedAt: publishedAt.toISOString(),
                },
                path: `/blog/${post.slug}`,
                publishedAt: publishedAt.toISOString(),
            },
            templateId: "post",
            templateVersion: 1,
            publishedAt,
        },
    });
    await prisma.post.update({
        where: { id: post.id },
        data: { currentPublicationId: publication.id, publishedAt },
    });
}

/**
 * Sell a product at a storefront (#510): its `ProductListing` there and, for
 * a product with variants, a `ProductListingVariant` for each — a product's
 * variants are all sold where it is. Keyed on the listing's own uniques, so a
 * re-run finds what the last one wrote. Returns the listing's id.
 */
export async function listProductAt(
    prisma: Db,
    a: {
        id: string;
        orgId: string;
        storeId: string;
        productId: string;
        variants?: readonly { id: string; variantId: string }[];
    },
): Promise<string> {
    const listing = await prisma.productListing.upsert({
        where: {
            storeId_productId: { storeId: a.storeId, productId: a.productId },
        },
        update: {},
        create: {
            id: a.id,
            organizationId: a.orgId,
            storeId: a.storeId,
            productId: a.productId,
        },
    });
    for (const v of a.variants ?? []) {
        await prisma.productListingVariant.upsert({
            where: {
                listingId_variantId: {
                    listingId: listing.id,
                    variantId: v.variantId,
                },
            },
            update: {},
            create: {
                id: v.id,
                organizationId: a.orgId,
                listingId: listing.id,
                productId: a.productId,
                variantId: v.variantId,
            },
        });
    }
    return listing.id;
}

/**
 * A storefront's shelf of a product (`variantId` null: counted as a whole) or
 * of one variant (#510). Its uniques are partial, so it is found and then
 * written rather than upserted. `promised` and `lowStockAlert` change only
 * when given. Returns the row's id.
 */
export async function setStockLevel(
    prisma: Db,
    a: {
        id: string;
        orgId: string;
        storeId: string;
        productId: string;
        variantId?: string | null;
        onHand: number;
        promised?: number;
        lowStockAlert?: number;
    },
): Promise<string> {
    const variantId = a.variantId ?? null;
    const data = {
        onHand: a.onHand,
        ...(a.promised === undefined ? {} : { promised: a.promised }),
        ...(a.lowStockAlert === undefined
            ? {}
            : { lowStockAlert: a.lowStockAlert }),
    };
    const found = await prisma.stockLevel.findFirst({
        where: { storeId: a.storeId, productId: a.productId, variantId },
        select: { id: true },
    });
    if (found) {
        await prisma.stockLevel.update({ where: { id: found.id }, data });
        return found.id;
    }
    await prisma.stockLevel.create({
        data: {
            id: a.id,
            organizationId: a.orgId,
            storeId: a.storeId,
            productId: a.productId,
            variantId,
            ...data,
        },
    });
    return a.id;
}

/**
 * Make each shelf's stock log add up to what it holds (#513). The seeds set
 * StockLevel.onHand directly; this writes one COUNTED entry wherever a row's
 * entries don't sum to its on hand — the opening count on a new row (from 0),
 * a re-count on a re-seeded one — so before + quantity = after holds and the
 * entries add up, exactly as the migration left real data. Idempotent: a
 * re-run over unchanged rows writes nothing. Returns the entries written.
 */
export async function balanceStockLog(
    prisma: Db,
    organizationId?: string,
): Promise<number> {
    const scope = organizationId ?? null;
    return prisma.$executeRaw`
        INSERT INTO "StockEntry" ("id", "organizationId", "stockLevelId", "storeId", "productId", "variantId",
                                  "kind", "quantity", "before", "after", "counted", "note", "createdAt")
        SELECT 'se' || replace(gen_random_uuid()::text, '-', ''), s."organizationId", s."id", s."storeId",
               s."productId", s."variantId", 'COUNTED', s."onHand" - COALESCE(e."total", 0),
               COALESCE(e."total", 0), s."onHand", s."onHand",
               CASE WHEN e."total" IS NULL THEN 'Opening count' ELSE NULL END, CURRENT_TIMESTAMP
        FROM "StockLevel" s
        LEFT JOIN (
            SELECT "stockLevelId", SUM("quantity")::int AS "total"
            FROM "StockEntry" GROUP BY "stockLevelId"
        ) e ON e."stockLevelId" = s."id"
        WHERE (e."total" IS NULL OR e."total" <> s."onHand")
          AND (${scope}::text IS NULL OR s."organizationId" = ${scope}::text)`;
}
