/**
 * `keys reseal` (DEC-214): after a new key is put at the front of a ring,
 * move every sealed value onto it, so the old key can be removed.
 *
 *     node apps/api.saroh.in/dist/cli/keys-reseal.cli.js --dry-run
 *     node apps/api.saroh.in/dist/cli/keys-reseal.cli.js --key=PAYMENTS_ENC_KEY
 *     node apps/api.saroh.in/dist/cli/keys-reseal.cli.js
 *
 * Run it in a one-off container from the API's image with the API's own
 * environment (`docs/architecture/runbooks/KEY_ROTATION.md`). It prints
 * counts and key ids, never a value or a key. Safe to run again and to stop
 * partway. Exit 1 when something is left that removing the old key would
 * break; run it again, then read the runbook.
 *
 * Built by hand rather than booting the app, so no job worker starts.
 */
import { prisma } from "@saroh/database";

import {
    failed,
    formatReport,
    RESEAL_KEY_NAMES,
    resealAll,
} from "./keys-reseal";

const TAG = "[keys-reseal]";

export interface ResealArgs {
    dryRun: boolean;
    keyName?: string;
}

/** The arguments, or null when one is not understood. */
export function parseArgs(argv: readonly string[]): ResealArgs | null {
    const args: ResealArgs = { dryRun: false };
    for (const arg of argv) {
        if (arg === "--dry-run") {
            args.dryRun = true;
            continue;
        }
        const key = /^--key=(.+)$/.exec(arg);
        if (key?.[1] && RESEAL_KEY_NAMES.includes(key[1])) {
            args.keyName = key[1];
            continue;
        }
        return null;
    }
    return args;
}

async function main(argv: string[]): Promise<number> {
    const args = parseArgs(argv);
    if (!args) {
        console.error(
            `${TAG} usage: keys-reseal [--dry-run] [--key=${RESEAL_KEY_NAMES.join("|")}]`,
        );
        return 2;
    }
    const report = await resealAll(args);
    for (const line of formatReport(report)) console.info(`${TAG} ${line}`);
    return failed(report) ? 1 : 0;
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
