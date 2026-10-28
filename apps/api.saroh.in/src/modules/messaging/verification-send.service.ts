import {
    ForbiddenException,
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
    ServiceUnavailableException,
    UnprocessableEntityException,
} from "@nestjs/common";
import type { VerificationModule } from "@saroh/database";

import { CatalogueService } from "../pricing/catalogue.service";
import { MessagingService } from "./messaging.service";
import type { OtpSendResult } from "./providers/messaging-provider.port";
import { indianPhoneE164, VerificationService } from "./verification.service";
import { WalletService } from "./wallet.service";

/**
 * Send a customer a code (DEC-191, #1242): the module's switch, the
 * published WhatsApp price, the abuse limits (`start`), a hold on the
 * wallet, then WhatsApp. An accepted WhatsApp keeps its hold until the
 * delivery report charges or frees it (U8, #1243); a refused one frees it
 * at once. Any refusal after `start` closes the session as FAILED, so no
 * session is left waiting on a code nobody sent.
 */
@Injectable()
export class VerificationSendService {
    private readonly logger = new Logger(VerificationSendService.name);

    constructor(
        private readonly verification: VerificationService,
        private readonly wallet: WalletService,
        private readonly catalogue: CatalogueService,
        private readonly messaging: MessagingService,
    ) {}

    async sendCode(input: {
        organizationId: string;
        module: VerificationModule;
        phoneE164: string;
        subjectRef?: string;
        ipHash?: string;
    }): Promise<{ verificationId: string; expiresAt: Date }> {
        const { organizationId } = input;
        if (!(await this.verification.approved(organizationId))) {
            throw new ForbiddenException({
                message: "This business doesn't send codes yet.",
                details: { code: "PHONE_CODES_NOT_APPROVED" },
            });
        }
        if (
            !(await this.verification.isEnabled(organizationId, input.module))
        ) {
            throw new ForbiddenException({
                message: "This business doesn't send codes for this yet.",
                details: { code: "VERIFICATION_OFF" },
            });
        }
        // Priced before the session, so an unpriced channel leaves nothing behind.
        const pricePaise = await this.whatsappPrice();
        const phoneE164 = indianPhoneE164(input.phoneE164);
        const { verificationId, code, expiresAt } =
            await this.verification.start({ ...input, phoneE164 });

        const hold = await this.wallet.hold(organizationId, pricePaise);
        if (!hold.ok) {
            await this.verification.fail(organizationId, verificationId);
            throw new HttpException(
                {
                    message:
                        "This business can't send codes right now: its messaging balance needs a top-up.",
                    details: { code: "INSUFFICIENT_BALANCE" },
                },
                HttpStatus.PAYMENT_REQUIRED,
            );
        }
        // shortcut: a crash between the hold and this row leaves the hold with no send for the sweep to free; move both into one transaction if it is ever seen.
        const { sendId } = await this.verification.recordSend({
            organizationId,
            verificationId,
            channel: "WHATSAPP",
            pricePaise,
            status: "QUEUED",
        });

        let result: OtpSendResult;
        try {
            result = await this.messaging.sendOtp({
                toE164: phoneE164,
                code,
            });
        } catch (error) {
            this.logger.warn(
                `verification_send transport_error send=${sendId}: ${error instanceof Error ? error.name : "unknown"}`,
            );
            result = { outcome: "rejected", reason: "transport_error" };
        }

        if (result.outcome === "accepted") {
            await this.verification.updateSend(organizationId, sendId, {
                status: "SENT",
                providerMessageId: result.providerMessageId,
            });
            return { verificationId, expiresAt };
        }

        const reason =
            result.outcome === "ineligible" ? "not_on_whatsapp" : result.reason;
        await this.verification.updateSend(organizationId, sendId, {
            status: "FAILED",
            failureReason: reason,
        });
        await this.wallet.release(sendId);
        await this.verification.fail(organizationId, verificationId);
        // SMS fallback slots in here once DLT registration clears (DEC-191).
        if (result.outcome === "ineligible") {
            throw new UnprocessableEntityException({
                message: "This number isn't on WhatsApp. Try a number that is.",
                details: { code: "NOT_ON_WHATSAPP", field: "phone" },
            });
        }
        throw new ServiceUnavailableException({
            message: "We couldn't send the code. Try again in a minute.",
            details: { code: "SEND_FAILED" },
        });
    }

    /**
     * Whether `sendCode` for `module` would send now: switched on, priced,
     * and the balance covers a code. For hiding a way in before anyone types
     * (DEC-196); any failure to tell is a no.
     */
    async canSend(
        organizationId: string,
        module: VerificationModule,
    ): Promise<boolean> {
        try {
            if (
                !(await this.verification.approved(organizationId)) ||
                !(await this.verification.isEnabled(organizationId, module))
            ) {
                return false;
            }
            const live = await this.catalogue.live(new Date());
            const price = live?.catalog.messagePrices?.whatsapp;
            if (price === undefined) return false;
            const wallet = await this.wallet.get(organizationId);
            const lapsed =
                wallet.expiresAt !== null && wallet.expiresAt <= new Date();
            return !lapsed && wallet.availablePaise >= price;
        } catch {
            return false;
        }
    }

    /** The live catalogue's WhatsApp price; none published refuses the send. */
    private async whatsappPrice(): Promise<number> {
        const live = await this.catalogue.live(new Date());
        const price = live?.catalog.messagePrices?.whatsapp;
        if (price === undefined) {
            this.logger.error("verification_send no_whatsapp_price");
            throw new ServiceUnavailableException({
                message: "Codes can't be sent right now. Try again later.",
                details: { code: "PRICE_UNAVAILABLE" },
            });
        }
        return price;
    }
}
