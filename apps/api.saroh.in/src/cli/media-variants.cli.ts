/**
 * `media variants` (DEC-246, plan image-variants §4): give photos uploaded
 * before sizing moved to the browser their size, blur and smaller WebP
 * copies. The rule is in media-variants.ts.
 *
 *     node apps/api.saroh.in/dist/cli/media-variants.cli.js --dry-run
 *     node apps/api.saroh.in/dist/cli/media-variants.cli.js [--limit=500]
 *
 * Run it in a one-off container from the API's image with the API's own
 * environment (R2 and DATABASE_URL), never inside the serving API (its
 * memory limit; DEV_LEARNINGS 20 Oct 2026):
 *
 *     docker run --rm --network coolify --env-file <the API's env, mode 600,
 *       removed after> --memory 2g <image> \
 *       node apps/api.saroh.in/dist/cli/media-variants.cli.js --dry-run
 *
 * Dry run first (counts, writes nothing, reads no bytes), then the run, then
 * a dry run again that must find 0 to do (a failed row is listed by id and
 * stays to do). Safe to stop and run again, and while the API serves.
 * Prints counts and media ids, never a key, a business or a secret.
 *
 * Built by hand rather than booting the app, so no job worker starts.
 */
import { Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";
import sharp from "sharp";

import { createObjectStorage } from "../modules/media/object-storage.provider";
import { backfillMediaVariants } from "./media-variants";

const TAG = "[media-variants]";

export interface VariantsArgs {
    dryRun: boolean;
    limit?: number;
}

/** The arguments, or null when one is not understood. */
export function parseArgs(argv: readonly string[]): VariantsArgs | null {
    const args: VariantsArgs = { dryRun: false };
    for (const arg of argv) {
        if (arg === "--dry-run") {
            args.dryRun = true;
            continue;
        }
        const limit = /^--limit=([1-9]\d*)$/.exec(arg);
        if (limit?.[1]) {
            args.limit = Number(limit[1]);
            continue;
        }
        return null;
    }
    return args;
}

async function main(argv: string[]): Promise<number> {
    const args = parseArgs(argv);
    if (!args) {
        console.error(`${TAG} usage: media-variants [--dry-run] [--limit=N]`);
        return 2;
    }
    const storage = createObjectStorage(new Logger("ObjectStorage"));
    if (!storage.seesUploads && !args.dryRun) {
        console.error(`${TAG} no R2 credentials: nothing to read or write`);
        return 2;
    }
    // One image at a time, no cache: memory stays flat in a small container.
    sharp.concurrency(1);
    sharp.cache(false);
    const report = await backfillMediaVariants(prisma, storage, {
        ...args,
        log: (line) => console.info(`${TAG} ${line}`),
    });
    console.info(
        `${TAG} ${report.candidates} to do; ${report.done} done, ${report.copies} copies (${report.copyBytes} bytes), ${report.failed.length} failed${args.dryRun ? " (dry run, nothing written)" : ""}`,
    );
    if (report.failed.length) {
        console.info(`${TAG} failed ids: ${report.failed.join(", ")}`);
    }
    return report.failed.length ? 1 : 0;
}

if (require.main === module) {
    main(process.argv.slice(2))
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
