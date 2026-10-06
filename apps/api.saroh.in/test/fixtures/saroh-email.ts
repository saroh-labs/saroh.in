import { prisma, writeCatalogueVersion } from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { parseCatalog, planRows } from "@saroh/pricing-catalog";

/**
 * A made-up catalogue for Saroh's booking emails (DEC-086) in the
 * integration specs. Nothing here is a real price, limit or plan: Plan A/B/C
 * with 3, 1 and no-number allowances, so a spec reaches each in a write or
 * two.
 *
 * - `free` (Plan A): 3 emails a month.
 * - `grow` (Plan B): 1 a month (the last-unit race).
 * - `pro` (Plan C): included with no number — Saroh never sends against it.
 * - `soft` (Plan D): 3 a month, but a soft cell — never refused, so Saroh
 *   never sends against it either.
 * - `max` (Plan E): 20 a month, room for the cap per booking.
 *
 * `withRow: false` is the same plans with no `saroh-emails` row at all.
 */
export function fakeSarohEmailsCatalog(withRow = true): Catalog {
    return parseCatalog({
        plans: [
            { id: "free", name: "Plan A", pricePaise: 0 },
            { id: "grow", name: "Plan B", pricePaise: 22_200 },
            { id: "pro", name: "Plan C", pricePaise: 33_300 },
            { id: "soft", name: "Plan D", pricePaise: 44_400 },
            { id: "max", name: "Plan E", pricePaise: 55_500 },
        ],
        groups: [{ id: "g", name: "Group" }],
        modules: [
            {
                id: "website",
                name: "Site",
                group: "g",
                cells: {
                    free: { inc: true, text: "One" },
                    grow: { inc: true, text: "One" },
                    pro: { inc: true, text: "One" },
                    soft: { inc: true, text: "One" },
                    max: { inc: true, text: "One" },
                },
            },
            ...(withRow
                ? [
                      {
                          id: "saroh-emails",
                          name: "Notes",
                          group: "g",
                          cells: {
                              free: {
                                  inc: true,
                                  text: "3",
                                  limit: 3,
                                  per: "month" as const,
                              },
                              grow: {
                                  inc: true,
                                  text: "1",
                                  limit: 1,
                                  per: "month" as const,
                              },
                              pro: { inc: true, text: "Included" },
                              soft: {
                                  inc: true,
                                  text: "3",
                                  limit: 3,
                                  per: "month" as const,
                                  soft: true,
                              },
                              max: {
                                  inc: true,
                                  text: "20",
                                  limit: 20,
                                  per: "month" as const,
                              },
                          },
                      },
                  ]
                : []),
        ],
        yearly: { on: false, paid: 10 },
        gst: { show: "excl" },
        addons: [],
    });
}

/** Publish `catalog` as `version`, live since yesterday. */
export async function installCatalogue(
    version: number,
    catalog: Catalog,
): Promise<void> {
    await writeCatalogueVersion(prisma, {
        version,
        catalog,
        goLiveAt: new Date(Date.now() - 24 * 60 * 60_000),
        policy: "keep",
        planRows: planRows(catalog, version),
    });
}

/** Put a business on `planId` of catalogue `version`. */
export async function subscribe(
    organizationId: string,
    planId: string,
    version: number,
): Promise<void> {
    const plan = await prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version,
                interval: "month",
            },
        },
    });
    await prisma.subscription.create({
        data: { organizationId, planId: plan.id, status: "ACTIVE" },
    });
}

/** A version number no other spec file uses. */
export function sarohEmailVersion(): number {
    return 830_000 + Math.floor(Math.random() * 9_000);
}
