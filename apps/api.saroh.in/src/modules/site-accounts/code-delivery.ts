import { Inject, Injectable, Optional } from "@nestjs/common";

import type { EmailOutcome } from "../../common/email";
import { sendSiteSignInCodeEmail } from "../../common/email";
import { structuredLogger } from "../../common/logging/structured-logger";

/**
 * Getting a sign-in code out, and telling Saroh when it doesn't (ADR-011;
 * round-2 plan A, A2).
 *
 * Without the code email nobody can book online, so a send is tried three
 * times inside the request (two quick retries), and every send that still
 * fails is an ERROR line, `site_code_send_failed`: that line is the alert
 * (#103 forwards ERRORs to the error tracker once it lands). When failures
 * pile up — 3 in 5 minutes across the API process — `site_code_send_failing`
 * says so once per window, which is what someone should be paged on.
 * Nothing logged here names the address, the code or the visitor.
 *
 * The same class raises the ceiling alerts (a business past its ceilings,
 * which may be someone spraying codes) and the "challenge not configured"
 * error, once per business and kind per hour so a flood is one line, not
 * thousands.
 */
export const SITE_CODE_SENDER = Symbol("SITE_CODE_SENDER");
export const SITE_CODE_RETRY_DELAYS = Symbol("SITE_CODE_RETRY_DELAYS");

export type SiteCodeSender = (
    to: string,
    details: { code: string; businessName: string; minutes: number },
) => Promise<EmailOutcome>;

const FAILURE_WINDOW_MS = 5 * 60_000;
const FAILURE_THRESHOLD = 3;
const REPEAT_ALERT_MS = 60 * 60_000;

@Injectable()
export class SiteCodeAlerts {
    private failures: number[] = [];
    private failingSince = Number.NEGATIVE_INFINITY;
    private readonly lastRaised = new Map<string, number>();

    /** One send failed after its retries. */
    sendFailed(
        organizationId: string,
        outcome: Exclude<EmailOutcome, "sent">,
        attempts: number,
        now: number = Date.now(),
    ): void {
        this.failures = this.failures.filter(
            (t) => now - t < FAILURE_WINDOW_MS,
        );
        this.failures.push(now);
        structuredLogger.error("site_code_send_failed", {
            organizationId,
            outcome,
            attempts,
            failuresInWindow: this.failures.length,
        });
        if (
            this.failures.length >= FAILURE_THRESHOLD &&
            now - this.failingSince >= FAILURE_WINDOW_MS
        ) {
            this.failingSince = now;
            structuredLogger.error("site_code_send_failing", {
                failuresInWindow: this.failures.length,
                windowMinutes: FAILURE_WINDOW_MS / 60_000,
            });
        }
    }

    /** Failed sends in the last five minutes: the alert's metric. */
    failuresInWindow(now: number = Date.now()): number {
        return this.failures.filter((t) => now - t < FAILURE_WINDOW_MS).length;
    }

    /** A business is past a ceiling: codes still go, Saroh should look. */
    ceilingPassed(
        organizationId: string,
        ceiling: "new-destinations" | "daily",
        now: number = Date.now(),
    ): void {
        if (!this.firstInHour(`${ceiling}:${organizationId}`, now)) return;
        structuredLogger.error("site_codes_ceiling_passed", {
            organizationId,
            ceiling,
        });
    }

    /**
     * A challenge was due but none is configured, so the code went without
     * one: the business is unprotected until Turnstile's keys are set.
     */
    challengeUnconfigured(
        organizationId: string,
        now: number = Date.now(),
    ): void {
        if (!this.firstInHour(`challenge:${organizationId}`, now)) return;
        structuredLogger.error("site_codes_challenge_unconfigured", {
            organizationId,
        });
    }

    private firstInHour(key: string, now: number): boolean {
        const last = this.lastRaised.get(key);
        if (last !== undefined && now - last < REPEAT_ALERT_MS) return false;
        this.lastRaised.set(key, now);
        return true;
    }
}

@Injectable()
export class SiteCodeDelivery {
    constructor(
        private readonly alerts: SiteCodeAlerts,
        @Optional()
        @Inject(SITE_CODE_SENDER)
        private readonly send: SiteCodeSender = sendSiteSignInCodeEmail,
        @Optional()
        @Inject(SITE_CODE_RETRY_DELAYS)
        private readonly retryDelaysMs: readonly number[] = [250, 750],
    ) {}

    /** True once the email has left; false after three failed tries. */
    async deliver(
        organizationId: string,
        to: string,
        details: { code: string; businessName: string; minutes: number },
    ): Promise<boolean> {
        const tries = this.retryDelaysMs.length + 1;
        for (let attempt = 1; attempt <= tries; attempt += 1) {
            let outcome: EmailOutcome;
            try {
                outcome = await this.send(to, details);
            } catch {
                outcome = "failed";
            }
            if (outcome === "sent") return true;
            // Nothing is configured: trying again changes nothing.
            if (outcome === "not-configured") {
                this.alerts.sendFailed(organizationId, outcome, attempt);
                return false;
            }
            const delay = this.retryDelaysMs[attempt - 1];
            if (delay) await new Promise((r) => setTimeout(r, delay));
        }
        this.alerts.sendFailed(organizationId, "failed", tries);
        return false;
    }
}
