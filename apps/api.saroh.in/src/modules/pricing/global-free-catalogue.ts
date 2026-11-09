import { liveCatalogueVersion, prisma } from "@saroh/database";
import type { Edition } from "@saroh/edition";
import { editionProfile } from "@saroh/edition";
import { freeOnlyCatalog, validateCatalog } from "@saroh/pricing-catalog";

import type {
    CatalogueWritesService,
    ImportResult,
} from "./catalogue-writes.service";

/**
 * The Global edition's first catalogue (stage 9, KTD3b). Until it exists a
 * Global business sits on India's Free row in rupees. This publishes India's
 * live catalogue's Free plan alone, in Global's plan money, as Global's
 * first version: no price to set, nothing to sync at the provider, live at
 * once. Its go-live queues the Free-rows job for Global, which moves Global
 * businesses off India's rows ({@link repointFreeRowsInTx}).
 *
 * Idempotent: once Global has a version this writes nothing. Null when it
 * did nothing (Global has one, or India has nothing live to copy).
 */
export async function installGlobalFreeCatalogue(
    writes: Pick<CatalogueWritesService, "importSnapshot">,
    now: Date,
): Promise<ImportResult | null> {
    const edition: Edition = "GLOBAL";
    const has = await prisma.pricingCatalogVersion.findFirst({
        where: { edition },
        select: { id: true },
    });
    if (has) return null;
    const india = await liveCatalogueVersion(prisma, "INDIA", now);
    const check = india ? validateCatalog(india.catalog) : null;
    if (!check?.ok) return null;
    return writes.importSnapshot(
        {
            catalog: freeOnlyCatalog(
                check.catalog,
                editionProfile(edition).sarohPlanMoney,
            ),
            note: `Free only, from India's version ${india?.version ?? "?"}`,
            settleProviderPlans: false,
        },
        now,
    );
}
