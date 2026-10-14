/**
 * `catalogue:import`: make a developer's OWN database's pricing catalogue a
 * copy of another environment's (the dev environment's, saroh.io), so the
 * local workspace and pricing page show the same plans.
 *
 *     pnpm --filter @saroh/api catalogue:import .local/catalogue.dev.json
 *
 * The file is what Admin › Plans › Versions › "Download catalogue (JSON)"
 * saves: `{ version, goLiveAt, catalog }`, the live version's snapshot as
 * stored. It carries real prices, so it lives in the git-ignored `.local/`
 * and never in the repository (`LOCAL_DEV.md`, "Plans: local matches dev").
 *
 * - It refuses any database that isn't on this machine, whatever
 *   `DATABASE_TARGET_CONFIRM` says, and on this machine one that isn't
 *   allow-listed (`saroh-dev` in development) unless that variable names it
 *   (`assertLocalDatabaseTarget`).
 * - It checks the snapshot with the catalogue's schema, then publishes it as
 *   the next version, live now, policy "keep", through the publish's own code
 *   (`CatalogueWritesService.importSnapshot`): `Plan` rows, change log,
 *   provider plans, the saroh.in revalidation and the Free rows, audited.
 * - With no platform Razorpay keys set (the usual local case) the paid
 *   plans' provider plans could never sync, and the version would wait
 *   behind the one before for ever. So it settles them itself as
 *   `local_<row id>` and the version is live at once, and it says so. With
 *   keys set it leaves them to the sync job, as a publish does.
 *
 * It prints the version numbers and counts, never a price, a limit or an
 * environment value. Run it again after a new dev release of the pricing: a
 * file that is the live version already changes nothing.
 *
 * Built by hand rather than booting the app, so no job worker starts: the
 * jobs it queues run when the local API is next up.
 */
// MUST stay the first import, bare: `@saroh/database` reads DATABASE_URL
// when it loads (src/main.ts says why).
import "../env";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { assertLocalDatabaseTarget, prisma } from "@saroh/database";

import { AdminAuditService } from "../modules/admin/admin-audit.service";
import {
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
    readPlatformSecret,
} from "../modules/billing/providers/platform-secrets";
import type { ImportResult } from "../modules/pricing/catalogue-writes.service";
import { CatalogueWritesService } from "../modules/pricing/catalogue-writes.service";

const TAG = "[catalogue-import]";

/** What the admin's download holds. `version` and `goLiveAt` are the source's. */
export interface CatalogueFile {
    version: number | null;
    goLiveAt: string | null;
    catalog: unknown;
}

/**
 * Read the downloaded file's shape, or say what is wrong with it. The
 * catalogue inside is checked by the publish (`validateCatalog`).
 */
export function parseCatalogueFile(
    text: string,
): { ok: true; file: CatalogueFile } | { ok: false; error: string } {
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        return { ok: false, error: "the file isn't JSON" };
    }
    if (!json || typeof json !== "object" || Array.isArray(json)) {
        return { ok: false, error: "the file isn't a catalogue download" };
    }
    const o = json as Record<string, unknown>;
    if (!o.catalog || typeof o.catalog !== "object") {
        return {
            ok: false,
            error: 'the file has no "catalog" (download it from Admin › Plans › Versions)',
        };
    }
    return {
        ok: true,
        file: {
            version: typeof o.version === "number" ? o.version : null,
            goLiveAt: typeof o.goLiveAt === "string" ? o.goLiveAt : null,
            catalog: o.catalog,
        },
    };
}

/**
 * Read the file named relative to where the command was typed: pnpm runs a
 * package script in the package's folder and says where it was started in
 * `INIT_CWD`, so `.local/catalogue.dev.json` from the repository root works.
 */
function readFromWhereRun(path: string): string {
    const from = globalThis.process.env.INIT_CWD ?? process.cwd();
    return readFileSync(resolve(from, path), "utf8");
}

/** Whether the platform Razorpay keys are set. Never reads them out. */
export function hasBillingKeys(
    read: (name: string) => string | undefined = readPlatformSecret,
): boolean {
    return Boolean(read(RAZORPAY_KEY_ID) && read(RAZORPAY_KEY_SECRET));
}

/** The note the version carries, naming where it came from. */
export function importNote(file: CatalogueFile): string {
    return file.version === null
        ? "Imported from a catalogue file"
        : `Copy of version ${file.version}, imported from a catalogue file`;
}

/** The lines the command prints. Numbers only: no price or limit. */
export function formatResult(
    result: ImportResult,
    file: CatalogueFile,
): string[] {
    const from = file.version === null ? "the file" : `version ${file.version}`;
    const lines = [
        `published ${from} as local version ${result.version}, ${result.status}, policy keep`,
        `changes from the version before: ${result.changes.length}`,
    ];
    if (result.settledLocally > 0) {
        lines.push(
            `no Razorpay keys here: marked its ${result.settledLocally} paid plan × cycle rows as synced locally (local_…), so it is live now; checkout still can't charge`,
        );
    } else if (result.providerPlans > 0) {
        lines.push(
            `${result.providerPlans} paid plan × cycle rows wait for the billing sync (Razorpay keys are set): it goes live when the local API has synced them`,
        );
    }
    return lines;
}

/** An error's words for the console: a Nest exception's message and details. */
function describe(error: unknown): string[] {
    const response = (
        error as { getResponse?: () => unknown } | null
    )?.getResponse?.();
    if (response && typeof response === "object") {
        const r = response as {
            message?: unknown;
            details?: { errors?: unknown };
        };
        const errors = Array.isArray(r.details?.errors)
            ? r.details.errors.filter((e): e is string => typeof e === "string")
            : [];
        const message = typeof r.message === "string" ? r.message : "refused";
        return [message, ...errors.map((e) => `  ${e}`)];
    }
    // The kind of failure, never its message: a database error can quote
    // the row it was about.
    return [error instanceof Error ? error.name : "error"];
}

export async function main(
    argv: readonly string[],
    deps: {
        writes?: CatalogueWritesService;
        hasKeys?: () => boolean;
        now?: () => Date;
        read?: (path: string) => string;
    } = {},
): Promise<number> {
    const path = argv[0]?.trim();
    if (!path || argv.length > 1) {
        console.error(`${TAG} usage: catalogue:import <catalogue file.json>`);
        return 2;
    }
    try {
        const target = assertLocalDatabaseTarget();
        console.info(`${TAG} database: ${target.database} on ${target.host}`);
    } catch (error) {
        console.error(
            `${TAG} ${error instanceof Error ? error.message : "refused"}`,
        );
        return 2;
    }
    let text: string;
    try {
        text = (deps.read ?? readFromWhereRun)(path);
    } catch {
        console.error(`${TAG} can't read that file`);
        return 2;
    }
    const parsed = parseCatalogueFile(text);
    if (!parsed.ok) {
        console.error(`${TAG} ${parsed.error}`);
        return 2;
    }
    const settle = !(deps.hasKeys ?? hasBillingKeys)();
    const writes =
        deps.writes ?? new CatalogueWritesService(new AdminAuditService());
    try {
        const result = await writes.importSnapshot(
            {
                catalog: parsed.file.catalog,
                note: importNote(parsed.file),
                settleProviderPlans: settle,
            },
            (deps.now ?? (() => new Date()))(),
        );
        for (const line of formatResult(result, parsed.file)) {
            console.info(`${TAG} ${line}`);
        }
        return 0;
    } catch (error) {
        const status = (
            error as { getStatus?: () => number } | null
        )?.getStatus?.();
        const lines = describe(error);
        // Already the live version: nothing to do, and that is fine.
        if (status === 409 && (lines[0] ?? "").includes("live already")) {
            console.info(`${TAG} ${lines[0]}`);
            return 0;
        }
        for (const line of lines) console.error(`${TAG} ${line}`);
        return 1;
    }
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
