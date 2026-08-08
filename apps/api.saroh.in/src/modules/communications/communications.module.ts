import type { OnModuleInit } from "@nestjs/common";
import { forwardRef, Module } from "@nestjs/common";

import { OrganizationGuard } from "../../common/guards/organization.guard";
import { JobHandlerRegistry } from "../jobs/job-handler.registry";
import { JobsModule } from "../jobs/jobs.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { CommunicationsController } from "./communications.controller";
import { CommunicationsService } from "./communications.service";
import { MESSAGE_SEND_TYPE, MessageSendHandler } from "./message-send.handler";
import { commsProviderFactoryProvider } from "./providers/provider.factory";

/**
 * Org communications (S6-001).
 *
 * Two halves wired together:
 *  - The READ/WRITE surface: {@link CommunicationsController} /
 *    {@link CommunicationsService} let an org connect a provider, record
 *    consent, queue messages, and read the auditable lifecycle, behind the same
 *    double-guard as the other org-scoped modules ({@link OrganizationsModule}
 *    supplies the `OrganizationContextService` that `OrganizationGuard` needs,
 *    via forwardRef).
 *  - The CONSUMER: {@link MessageSendHandler} is registered with the
 *    {@link JobHandlerRegistry} (from {@link JobsModule}) for the `message.send`
 *    job type on boot, so the durable job worker delivers each queued message
 *    via the org's connected provider. The {@link commsProviderFactoryProvider}
 *    (real email/WhatsApp adapters in prod) backs it via `COMMS_PROVIDER_FACTORY`.
 */
@Module({
    imports: [JobsModule, forwardRef(() => OrganizationsModule)],
    controllers: [CommunicationsController],
    providers: [
        CommunicationsService,
        MessageSendHandler,
        commsProviderFactoryProvider,
        OrganizationGuard,
    ],
    exports: [CommunicationsService],
})
export class CommunicationsModule implements OnModuleInit {
    constructor(
        private readonly registry: JobHandlerRegistry,
        private readonly handler: MessageSendHandler,
    ) {}

    /** Wire the message-send consumer into the job worker at boot. */
    onModuleInit(): void {
        this.registry.register(MESSAGE_SEND_TYPE, this.handler.handle);
    }
}
