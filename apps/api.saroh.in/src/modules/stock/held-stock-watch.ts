import type { OnApplicationBootstrap } from "@nestjs/common";
import { Injectable, Logger } from "@nestjs/common";
import {
    describeHeldStockMismatches,
    heldStockMismatches,
    prisma,
} from "@saroh/database";

import { env } from "../../env";

/** How many broken rows and lines one warning names; the rest are counted. */
const NAMED = 20;

/** How long either of the check's two reads may take before it gives up. */
const CHECK_TIMEOUT_MS = 30_000;
const CHECK_TIMEOUT = `${CHECK_TIMEOUT_MS}ms`;

/**
 * Held stock, checked when the API starts (#511): every row's promised
 * should be the sum of its open lines' `heldQuantity`, and closed lines hold
 * nothing. Each business sees its own broken rows in Stock checks
 * (PROMISED_MISMATCH); this is the operators' view across every business, so
 * a rollout that skipped the listings backfill
 * (docs/architecture/PRODUCTS_STOCK_ROLLOUT.md) — or anything else that
 * wrote rows and lines outside `reserve.ts` — is seen in the logs on the
 * next start instead of compounding with every order.
 *
 * ERROR, because an invariant broke: one line with the count and what to
 * run, then up to 20 rows and lines by id. Any is too many; none is normal.
 * Never blocks the start: the check runs after it, and a failed read is
 * itself logged.
 */
@Injectable()
export class HeldStockWatch implements OnApplicationBootstrap {
    private readonly logger = new Logger(HeldStockWatch.name);

    onApplicationBootstrap(): void {
        if (env.NODE_ENV === "test") return;
        void this.check().catch((error: unknown) => {
            const message =
                error instanceof Error ? error.message : String(error);
            this.logger.warn(`Could not check held stock: ${message}`);
        });
    }

    /** Log what doesn't add up; returns how many rows and lines. */
    async check(): Promise<number> {
        // Read only what holds or promises stock (two partial indexes), and
        // never for long: every instance runs this at its start, and a slow
        // database is better left unread than loaded further.
        const found = await prisma.$transaction(
            async (tx) => {
                // SET LOCAL, which takes no bound parameter.
                await tx.$queryRaw`SELECT set_config('statement_timeout', ${CHECK_TIMEOUT}, true)`;
                return heldStockMismatches(tx);
            },
            { timeout: 2 * CHECK_TIMEOUT_MS + 5_000 },
        );
        const total = found.rows.length + found.lines.length;
        if (total === 0) return 0;
        const businesses = new Set([
            ...found.rows.map((r) => r.organizationId),
            ...found.lines.map((l) => l.organizationId),
        ]).size;
        this.logger.error(
            `Held stock doesn't add up: ${found.rows.length} row(s) whose promised isn't what their open orders hold and ${found.lines.length} line(s) holding units they can't, in ${businesses} business(es). Run packages/database/src/backfill/held-stock.cli.ts --dry-run to see the repair, then without it (docs/architecture/PRODUCTS_STOCK_ROLLOUT.md).`,
        );
        const described = describeHeldStockMismatches(found);
        for (const line of described.slice(0, NAMED)) {
            this.logger.error(`  ${line}`);
        }
        if (described.length > NAMED) {
            this.logger.error(`  …and ${described.length - NAMED} more`);
        }
        return total;
    }
}
