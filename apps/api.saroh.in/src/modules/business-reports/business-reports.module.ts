import { Module } from "@nestjs/common";

import { BusinessReportsService } from "./business-reports.service";
import { PublicBusinessReportsController } from "./public-business-reports.controller";

/**
 * Customers' reports about a business that uses Saroh (saroh.in/customers).
 * Guardless and org-agnostic on the public side: the reporter has no
 * account, and the business comes from the address they typed, never from
 * the request. Staff read them through the admin module.
 */
@Module({
    controllers: [PublicBusinessReportsController],
    providers: [BusinessReportsService],
})
export class BusinessReportsModule {}
