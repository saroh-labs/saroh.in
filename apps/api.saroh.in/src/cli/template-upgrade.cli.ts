/**
 * `template upgrade` (DEC-141): bring every existing starter, Personal and
 * Portfolio site's DRAFT up to its template's newest version, so each gets
 * the new look and the sections for what its business has switched on.
 *
 *     node apps/api.saroh.in/dist/cli/template-upgrade.cli.js --dry-run
 *     node apps/api.saroh.in/dist/cli/template-upgrade.cli.js
 *     node apps/api.saroh.in/dist/cli/template-upgrade.cli.js --limit=20
 *
 * Run it inside the API's own container (it reads the same environment:
 * the database, and the switches that say which modules a business has).
 * It lives here and not beside the database package's backfills because the
 * rule it applies is the templates' (`@saroh/templates`) and the facts it
 * reads are the API's (which modules are rolled out for a business); the
 * database package can reach neither.
 *
 * - `--dry-run` reads and plans, writes nothing, and prints what a run
 *   would do.
 * - `--limit=N` stops after N sites have been upgraded, for a first careful
 *   run. Run it again to carry on: a site already on the newest version is
 *   skipped, so it is safe to run more than once and to stop partway.
 *
 * It writes drafts only. Nothing goes live: each owner sees the changes
 * waiting in their editor and publishes (`sites/template-upgrade.ts`).
 *
 * It prints counts, nothing else: never a business's name, an address or a
 * line of anyone's site. Exit 1 when a site failed (nothing of that site
 * was written); run it again.
 *
 * Built by hand rather than booting the app, so no job worker starts.
 */
import { prisma } from "@saroh/database";

import type { TemplateUpgradeReport } from "../modules/sites/template-upgrade";
import { upgradeTemplateSites } from "../modules/sites/template-upgrade";

const TAG = "[template-upgrade]";

export interface UpgradeArgs {
    dryRun: boolean;
    limit?: number;
}

/** The arguments, or null when one is not understood. */
export function parseArgs(argv: readonly string[]): UpgradeArgs | null {
    const args: UpgradeArgs = { dryRun: false };
    for (const arg of argv) {
        if (arg === "--dry-run") {
            args.dryRun = true;
            continue;
        }
        const limit = /^--limit=(\d+)$/.exec(arg);
        if (limit && Number(limit[1]) > 0) {
            args.limit = Number(limit[1]);
            continue;
        }
        return null;
    }
    return args;
}

/** The lines the rollout doc shows. Counts only. */
export function formatReport(report: TemplateUpgradeReport): string[] {
    const did = report.dryRun ? "would upgrade" : "upgraded";
    const moves = Object.entries(report.moves)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([move, count]) => `${move}: ${count}`);
    const c = report.counts;
    return [
        `${report.dryRun ? "dry run, nothing written. " : ""}sites on these templates: ${report.sites}, ${did}: ${report.upgraded}, already current: ${report.alreadyCurrent}, unknown version: ${report.unknownVersion}, failed: ${report.failed}`,
        `look: applied ${report.styleApplied}, kept ${report.styleKept}; footer: applied ${report.footerApplied}, kept ${report.footerKept}`,
        `pages: replaced ${c.pagesReplaced}, kept with sections added ${c.pagesMerged}, added ${c.pagesCreated}, hidden ${c.pagesHidden}; sections added ${c.sectionsAdded}; owner notes removed ${c.ownerNotesRemoved}; module pages added ${c.modulePagesAdded}`,
        ...(moves.length > 0 ? [`moves: ${moves.join(", ")}`] : []),
    ];
}

async function main(argv: string[]): Promise<number> {
    const args = parseArgs(argv);
    if (!args) {
        console.error(`${TAG} usage: template-upgrade [--dry-run] [--limit=N]`);
        return 2;
    }
    const report = await upgradeTemplateSites(args);
    for (const line of formatReport(report)) console.info(`${TAG} ${line}`);
    return report.failed > 0 ? 1 : 0;
}

if (require.main === module) {
    main(process.argv.slice(2))
        .then((code) => {
            process.exitCode = code;
        })
        .catch((error: unknown) => {
            // The kind of failure, never its message: a database error can
            // quote the row it was about.
            console.error(
                `${TAG} failed: ${error instanceof Error ? error.name : "error"}`,
            );
            process.exitCode = 1;
        })
        .finally(() => {
            void prisma.$disconnect();
        });
}
