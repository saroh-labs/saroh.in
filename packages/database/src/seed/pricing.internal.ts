// INTERNAL — strip before this branch leaves local. Prices and limits are not public.
/**
 * The seed's businesses on the pricing catalogue (plans catalogue U12).
 *
 * The demo businesses used to sit on a hand-made legacy `business` plan. They
 * now subscribe to a catalogue plan, so what they may do is read the way a
 * real business's is (`CatalogueAccessService`). The catalogue itself is the
 * seed catalogue, `@saroh/pricing-catalog/seed` (INTERNAL: it holds the real
 * prices and limits), installed as version 1 on a database that has none —
 * the same as `install-seed-catalogue.internal.cli.ts` in the API. A database
 * that already has versions keeps them; the businesses go on the live one.
 *
 * They are put on the top plan so no catalogue lock or limit ever bites a
 * demo, a film or a browser spec (the custom roles, the team, the products).
 * This file is the only place in the seed that names the catalogue.
 */
import { planRows } from "@saroh/pricing-catalog";
import { SEED_CATALOG, SEED_NOTE } from "@saroh/pricing-catalog/seed";

import {
    liveCataloguePlanRow,
    writeCatalogueVersion,
} from "../pricing-catalogue";
import type { Db } from "./helpers";

/** The catalogue plan the seeded businesses are on. */
export const SEED_PLAN_ID = "pro";

/**
 * Install the seed catalogue as version 1 if no version exists. Two seeds
 * racing for version 1 meet the unique index; the loser reads it.
 */
async function ensureCatalogue(prisma: Db, now: Date): Promise<void> {
    const any = await prisma.pricingCatalogVersion.findFirst({
        select: { id: true },
    });
    if (any) return;
    try {
        await writeCatalogueVersion(prisma, {
            version: 1,
            catalog: SEED_CATALOG,
            goLiveAt: now,
            policy: "keep",
            note: SEED_NOTE,
            changes: [],
            publishedByUserId: null,
            planRows: planRows(SEED_CATALOG, 1),
        });
    } catch (e) {
        if ((e as { code?: string }).code !== "P2002") throw e;
    }
}

/**
 * The `Plan` row the seeded businesses subscribe to: {@link SEED_PLAN_ID},
 * monthly, on the live version. Throws when the live version has no such
 * plan, rather than seeding a business onto nothing.
 */
export async function seedPlanId(prisma: Db, now: Date): Promise<string> {
    await ensureCatalogue(prisma, now);
    const row = await liveCataloguePlanRow(prisma, SEED_PLAN_ID, "month", now);
    if (!row) {
        throw new Error(
            `The live pricing catalogue has no "${SEED_PLAN_ID}" plan to seed businesses on.`,
        );
    }
    return row.id;
}
