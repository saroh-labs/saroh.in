import { writeCatalogueVersion } from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { planRows } from "@saroh/pricing-catalog";

type Db = Parameters<typeof writeCatalogueVersion>[0];

/**
 * Put a first catalogue version on a database that has none (plans
 * catalogue U3). The migration creates the tables empty and carries no
 * prices; a local or test database gets version 1 from this, with its `Plan`
 * rows, live from `now`, policy "keep", published by nobody.
 *
 * Idempotent: once any version exists it writes nothing and says which is
 * the newest. Two runs racing for version 1 meet the unique index, and the
 * loser reads as "already installed".
 */
export async function installFirstCatalogue(
    db: Db,
    input: { catalog: Catalog; note: string; now: Date },
): Promise<{ installed: boolean; version: number }> {
    const newest = await db.pricingCatalogVersion.findFirst({
        orderBy: { version: "desc" },
        select: { version: true },
    });
    if (newest) return { installed: false, version: newest.version };
    try {
        await writeCatalogueVersion(db, {
            version: 1,
            catalog: input.catalog,
            goLiveAt: input.now,
            policy: "keep",
            note: input.note,
            changes: [],
            publishedByUserId: null,
            planRows: planRows(input.catalog, 1),
        });
        return { installed: true, version: 1 };
    } catch (e) {
        if ((e as { code?: string }).code === "P2002") {
            return { installed: false, version: 1 };
        }
        throw e;
    }
}
