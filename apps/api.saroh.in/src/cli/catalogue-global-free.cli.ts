/**
 * Give the Global edition its first catalogue (stage 9, KTD3b):
 *
 *     pnpm --filter @saroh/api catalogue:global-free
 *
 * Publishes India's live Free plan alone, in Global's plan money, as
 * Global's first version (`installGlobalFreeCatalogue`), audited as an
 * import. Its go-live queues the Free-rows job for Global, which moves
 * Global businesses off India's Free row once the API's worker runs it.
 * Run once per environment, in a one-off container on a server; a second
 * run changes nothing. It prints version numbers only.
 */
// MUST stay the first import, bare: `@saroh/database` reads DATABASE_URL
// when it loads (src/main.ts says why).
import "../env";

import { prisma } from "@saroh/database";

import { AdminAuditService } from "../modules/admin/admin-audit.service";
import { CatalogueWritesService } from "../modules/pricing/catalogue-writes.service";
import { installGlobalFreeCatalogue } from "../modules/pricing/global-free-catalogue";

const TAG = "[catalogue-global-free]";

export async function main(
    deps: { writes?: CatalogueWritesService; now?: () => Date } = {},
): Promise<number> {
    const writes =
        deps.writes ?? new CatalogueWritesService(new AdminAuditService());
    const result = await installGlobalFreeCatalogue(
        writes,
        (deps.now ?? (() => new Date()))(),
    );
    if (!result) {
        console.info(
            `${TAG} nothing to do: Global has a version, or India has none live`,
        );
        return 0;
    }
    console.info(
        `${TAG} published Global's version ${result.version}, ${result.status}`,
    );
    return 0;
}

if (require.main === module) {
    main()
        .then((code) => {
            process.exitCode = code;
        })
        .catch((error: unknown) => {
            console.error(
                `${TAG} failed: ${error instanceof Error ? error.name : "error"}`,
            );
            process.exitCode = 1;
        })
        .finally(() => {
            void prisma.$disconnect();
        });
}
