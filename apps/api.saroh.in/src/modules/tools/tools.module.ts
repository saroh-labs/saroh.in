import { Module } from "@nestjs/common";

import { QrMakerGateService } from "./qr-maker-gate.service";
import { QrMakerController } from "./qr-maker.controller";

/**
 * PUBLIC: saroh.in's free tools that need nothing but an email gate. Today
 * that is the QR code maker (QR codes plan U9), whose code is drawn in the
 * visitor's browser; the link preview tool, which fetches a stranger's
 * page, keeps its own module. Guardless and org-agnostic, like the
 * waitlist: there is no business to scope to.
 */
@Module({
    controllers: [QrMakerController],
    providers: [QrMakerGateService],
})
export class ToolsModule {}
