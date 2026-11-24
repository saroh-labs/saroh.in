import { Logger } from "@nestjs/common";

import type {
    MessagingProvider,
    SendResult,
    SmsSendResult,
    WhatsappAuthInput,
    WhatsAppTemplateCategory,
    WidgetVerifyResult,
} from "./messaging-provider.port";

/**
 * WhatsApp through Meta or MSG91, picked on every send by the admin
 * console's "WhatsApp through Meta" switch (`WHATSAPP_VIA_META`, owner
 * 24 Nov), so a broken sender is swapped without a redeploy. SMS and the
 * OTP widget are always MSG91's (DEC-213). The switch can't be read: MSG91.
 */
export class SwitchedWhatsappProvider implements MessagingProvider {
    private readonly logger = new Logger(SwitchedWhatsappProvider.name);

    constructor(
        private readonly meta: MessagingProvider,
        private readonly msg91: MessagingProvider,
        private readonly viaMeta: () => Promise<boolean>,
    ) {}

    private async whatsapp(): Promise<MessagingProvider> {
        try {
            return (await this.viaMeta()) ? this.meta : this.msg91;
        } catch {
            this.logger.warn(
                "whatsapp_switch_unreadable: sending WhatsApp through MSG91",
            );
            return this.msg91;
        }
    }

    async sendWhatsappAuth(input: WhatsappAuthInput): Promise<SendResult> {
        return (await this.whatsapp()).sendWhatsappAuth(input);
    }

    async sendWhatsAppTemplate(input: {
        toE164: string;
        template: string;
        category: WhatsAppTemplateCategory;
        variables: string[];
    }): Promise<SendResult> {
        return (await this.whatsapp()).sendWhatsAppTemplate(input);
    }

    async sendWhatsAppText(input: {
        toE164: string;
        text: string;
    }): Promise<SendResult> {
        return (await this.whatsapp()).sendWhatsAppText(input);
    }

    sendSms(input: { toE164: string; text: string }): Promise<SmsSendResult> {
        return this.msg91.sendSms(input);
    }

    verifyOtpWidgetToken(accessToken: string): Promise<WidgetVerifyResult> {
        return this.msg91.verifyOtpWidgetToken(accessToken);
    }
}
