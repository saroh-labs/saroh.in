import { Module } from "@nestjs/common";

import { CustomerAccountRepository } from "./customer-account.repository";

/**
 * A business's customers signing in on its own site (ADR-011, DEC-037;
 * round-2 plan A). A1 lays the tables and the account repository; sign-in
 * codes and the signed relay (A2), the session guard (A3) and account ↔
 * contact linking (A4) add their controllers and services here.
 */
@Module({
    providers: [CustomerAccountRepository],
    exports: [CustomerAccountRepository],
})
export class SiteAccountsModule {}
