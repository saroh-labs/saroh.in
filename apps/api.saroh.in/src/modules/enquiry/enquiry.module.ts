import { Module } from "@nestjs/common";

import { EnquiryController } from "./enquiry.controller";
import { EnquiryService } from "./enquiry.service";

/**
 * PUBLIC enquiry submission (S3-002). Intentionally guardless and org-agnostic:
 * it needs no {@link OrganizationsModule}/`OrganizationGuard` because there is no
 * session and no client-supplied org — the owning org is derived from the target
 * Form inside {@link EnquiryService}.
 */
@Module({
    controllers: [EnquiryController],
    providers: [EnquiryService],
    exports: [EnquiryService],
})
export class EnquiryModule {}
