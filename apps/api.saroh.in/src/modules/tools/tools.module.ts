import { Module } from "@nestjs/common";

import { ChallengeVerifier } from "../site-accounts/challenge";
import { DownloadGateController } from "./download-gate.controller";
import { DownloadGateService } from "./download-gate.service";
import { QrMakerGateService } from "./qr-maker-gate.service";
import { QrMakerController } from "./qr-maker.controller";

/**
 * PUBLIC: saroh.in's free tools that need nothing but an email gate. Today
 * that is the QR code maker (QR codes plan U9), whose code is drawn in the
 * visitor's browser, and the free downloads' gate (plan 2026-10-31-002 U9);
 * the link preview tool, which fetches a stranger's page, keeps its own
 * module. Guardless and org-agnostic, like the waitlist: there is no
 * business to scope to.
 */
@Module({
    controllers: [QrMakerController, DownloadGateController],
    providers: [QrMakerGateService, DownloadGateService, ChallengeVerifier],
})
export class ToolsModule {}
