import { Injectable } from "@nestjs/common";

import type { OtpSendResult, OtpTransport } from "./otp-transport.port";

/**
 * Network-free {@link OtpTransport} for tests and local development without
 * MSG91 credentials. Records every send; a number can be marked ineligible or
 * rejected.
 */
@Injectable()
export class FakeOtpTransport implements OtpTransport {
    readonly sends: { toE164: string; code: string }[] = [];
    private readonly ineligible = new Set<string>();
    private readonly rejected = new Map<string, string>();

    markIneligible(toE164: string): void {
        this.ineligible.add(toE164);
    }

    reject(toE164: string, reason = "refused"): void {
        this.rejected.set(toE164, reason);
    }

    sendWhatsappAuth(input: {
        toE164: string;
        code: string;
    }): Promise<OtpSendResult> {
        this.sends.push(input);
        if (this.ineligible.has(input.toE164))
            return Promise.resolve({ outcome: "ineligible" });
        const reason = this.rejected.get(input.toE164);
        if (reason) return Promise.resolve({ outcome: "rejected", reason });
        return Promise.resolve({
            outcome: "accepted",
            providerMessageId: `fake_whatsapp_${this.sends.length}`,
        });
    }
}
