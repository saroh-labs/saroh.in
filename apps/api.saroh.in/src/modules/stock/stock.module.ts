import { Module } from "@nestjs/common";

import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { StockChecksService } from "./stock-checks.service";
import { StockReadsService } from "./stock-reads.service";
import { StockWritesService } from "./stock-writes.service";
import { StockController } from "./stock.controller";
import { StockService } from "./stock.service";

/**
 * The stock log and its rules (#513), and the Stock API (#514). The rules'
 * functions run on the caller's transaction, so the order flows and the
 * products module call them directly; `StockService` is the same set for
 * code that is injected. The API reads levels, the log and the checks, and
 * writes counts, entries, moves and undos through those rules.
 */
@Module({
    controllers: [StockController],
    providers: [
        StockService,
        StockReadsService,
        StockWritesService,
        StockChecksService,
        IdempotencyService,
    ],
    exports: [StockService],
})
export class StockModule {}
