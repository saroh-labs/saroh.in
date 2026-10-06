import { Module } from "@nestjs/common";

import { LinkPreviewController } from "./link-preview.controller";
import { LinkPreviewService } from "./link-preview.service";
import { LinkReportGateService } from "./link-report-gate.service";

/**
 * PUBLIC link preview tool (resources plan U2, KTD-3 and KTD-5): the one
 * place Saroh fetches a stranger's address, behind `ssrf-guard.ts`, and
 * its email gate, which writes to the waitlist's store. Guardless and
 * org-agnostic, like the waitlist: there is no business to scope to.
 */
@Module({
    controllers: [LinkPreviewController],
    providers: [LinkPreviewService, LinkReportGateService],
})
export class LinkPreviewModule {}
