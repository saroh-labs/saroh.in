import { Module } from "@nestjs/common";

import { AdminAuditService } from "../admin/admin-audit.service";
import { SarohBusinessContactsService } from "./business-contacts.service";
import { SarohLeadWritesService } from "./saroh-lead-writes.service";
import { SarohLeadsService } from "./saroh-leads.service";

/**
 * Saroh's own sales leads (DEC-169, admin console U20). The reads and the
 * writes live here; their controller (`saroh-leads.controller.ts`) is registered by the
 * admin module, so the console's guards and permission contract cover it.
 * Enquiries and the waitlist make leads through `lead-intake.ts`, and the
 * enquiry purge deletes old ones through `lead-retention.ts`: plain
 * functions, so those public modules import nothing of the console's.
 */
@Module({
    providers: [
        SarohLeadsService,
        SarohLeadWritesService,
        SarohBusinessContactsService,
        AdminAuditService,
    ],
    exports: [
        SarohLeadsService,
        SarohLeadWritesService,
        SarohBusinessContactsService,
    ],
})
export class SarohLeadsModule {}
