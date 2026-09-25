import { Module } from "@nestjs/common";

import { StockService } from "./stock.service";

/**
 * The stock log and its rules (#513). Its functions run on the caller's
 * transaction, so the order flows and the products module call them
 * directly; `StockService` is the same set for code that is injected (the
 * Stock API, U5).
 */
@Module({
    providers: [StockService],
    exports: [StockService],
})
export class StockModule {}
