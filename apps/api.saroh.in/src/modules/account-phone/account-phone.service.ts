import {
    BadRequestException,
    ConflictException,
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
    ServiceUnavailableException,
    UnprocessableEntityException,
} from "@nestjs/common";
import { startPhoneSession } from "@saroh/auth";
import type { AccountPhoneEventKind } from "@saroh/database";
import { prisma } from "@saroh/database";

import { auth } from "../../common/auth/auth";
import { hashClientIp } from "../../common/client-ip";
import { prismaErrorCode } from "../../common/prisma-errors";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { numberHash } from "../messaging/messaging-records";
import { MessagingService } from "../messaging/messaging.service";
import { ChallengeVerifier } from "../site-accounts/challenge";
import type { CodeCheck } from "./phone-codes";
import { checkCode, CODE_MINUTES, newCode, saveCode } from "./phone-codes";
import type { LimitVerdict } from "./phone-limits";
import {
    checkFailures,
    checkStart,
    START_COOLDOWN_SECONDS,
} from "./phone-limits";

/** How the code reaches the phone. WhatsApp is the default (owner, 28 Oct). */
export type PhoneChannel = "whatsapp" | "sms";
/** Who a code is for: signing in, or the signed-in person adding a phone. */
export type PhonePurpose = "sign-in" | "add";

/**
 * What proves the person holds the phone, checked on the server: a
 * WhatsApp code Saroh sent, or the SMS widget's access token.
 */
export type PhoneProof = { code: string } | { accessToken: string };

/** What the browser does once a start is allowed. */
export type PhoneStart =
    /** Saroh sent a code on WhatsApp; the person types it. */
    | { whatsapp: { resendAfterSeconds: number } }
    /** The provider's OTP widget (SMS only), loaded from `scriptUrl`. */
    | {
          widget: { widgetId: string; tokenAuth: string; scriptUrl: string };
      }
    /** Development and test only: no widget; this token stands in for its answer. */
    | { standIn: { token: string } };

export interface PhoneOptions {
    /** Whether phone sign-in can be offered at all: either channel below. */
    available: boolean;
    /** Whether Saroh can send a code on WhatsApp. */
    whatsapp: boolean;
    /** Whether the SMS widget (or its stand-in) is set up. */
    sms: boolean;
    /** Turnstile's public key, or null when no challenge is asked. */
    turnstileSiteKey: string | null;
    /**
     * Whether every account must have a verified phone
     * (`PHONE_REQUIRED_FOR_ACCOUNTS`, platform-wide). Accounts asks for one
     * after sign-in only while this AND `available` are true, so nobody is
     * held at a step that can't send a code.
     */
    required: boolean;
}

/** The one answer for a phone with no account, whoever asks. */
export const NO_ACCOUNT_FOR_PHONE =
    "Use your email to sign in, then add this phone in your account.";

/**
 * Phone sign-in for Saroh accounts (DEC-196): owners and staff on
 * accounts.saroh.in. A phone is added to an email account, never instead
 * of one, and once verified it is a second way in.
 *
 * Two ways to get the code (owner, 28 Oct: "widget is for SMS"): WhatsApp,
 * made, sent and checked here from Saroh's own number (`phone-codes.ts`),
 * and SMS through the provider's widget.
 *
 * Nothing here trusts the browser: every sign-in and every saved phone
 * starts with a server check, of the WhatsApp code against its stored hash
 * or of the widget's token with the provider ({@link MessagingService.verifyOtp}).
 * The session is Better Auth's own (`startPhoneSession`,
 * `packages/auth/src/phone-sign-in.ts`).
 *
 * Logs name the reason and hashes only, never a number.
 */
@Injectable()
export class AccountPhoneService {
    private readonly logger = new Logger(AccountPhoneService.name);

    constructor(
        private readonly messaging: MessagingService,
        private readonly challenge: ChallengeVerifier,
        private readonly flags: FeatureFlagService,
    ) {}

    async options(): Promise<PhoneOptions> {
        const whatsapp = this.messaging.whatsappOtpReady;
        const sms =
            this.messaging.otpStandIn ||
            this.messaging.otpWidgetConfig() !== null;
        const available = whatsapp || sms;
        // No organization: only the flag's global default counts.
        const required = await this.flags.isEnabled(
            FlagKey.PHONE_REQUIRED_FOR_ACCOUNTS,
        );
        if (required && !available) {
            this.logger.warn(
                "account_phone_required_unavailable: phone codes can't be sent, so sign-in lets accounts without a phone through",
            );
        }
        return {
            available,
            whatsapp,
            sms,
            turnstileSiteKey: this.challenge.siteKey,
            required,
        };
    }

    /**
     * The bot challenge, then the start limits. WhatsApp: make the code and
     * send it from here. SMS: hand back the widget, which sends from the
     * browser. The answer is the same whether or not the phone has an
     * account.
     */
    async start(input: {
        phoneE164: string;
        channel: PhoneChannel;
        purpose: PhonePurpose;
        /** The signed-in person, for `add`. */
        userId?: string;
        turnstileToken?: string;
        ip?: string;
    }): Promise<PhoneStart> {
        const keys = this.keys(input.phoneE164, input.ip);
        if (!(await this.challenged(input, keys))) {
            this.blocked("start", "challenge", keys);
            throw new BadRequestException({
                message: "Confirm you're not a robot, then try again.",
                details: { code: "CHALLENGE" },
            });
        }
        const verdict = await checkStart(keys);
        if (!verdict.allowed) {
            this.blocked("start", verdict.reason, keys);
            throw tooMany(verdict);
        }
        if (input.channel === "whatsapp") return this.sendWhatsapp(input, keys);

        const token = this.messaging.standInOtpToken(input.phoneE164);
        const widget = this.messaging.otpWidgetConfig();
        const answer: PhoneStart | null = token
            ? { standIn: { token } }
            : widget
              ? { widget }
              : null;
        if (!answer) {
            this.blocked("start", "unavailable", keys);
            throw new ServiceUnavailableException({
                message:
                    "Phone sign-in isn't available right now. Use your email.",
                details: { code: "UNAVAILABLE" },
            });
        }
        await record("START", keys);
        return answer;
    }

    /**
     * Sign in with a verified phone. Returns the headers Better Auth set
     * (the session cookie) for the controller to copy onto the reply.
     */
    async signIn(input: {
        phoneE164: string;
        proof: PhoneProof;
        ip?: string;
        headers: Headers;
    }): Promise<Headers> {
        const keys = this.keys(input.phoneE164, input.ip);
        const phone = await this.verified(input, "SIGN_IN", keys);
        const user = await prisma.user.findFirst({
            where: { phoneE164: phone, phoneVerifiedAt: { not: null } },
            select: { id: true },
        });
        if (!user) {
            await this.fail(keys, "unknown_phone");
            throw new BadRequestException({
                message: NO_ACCOUNT_FOR_PHONE,
                details: { code: "NO_ACCOUNT" },
            });
        }
        let headers: Headers;
        try {
            headers = await startPhoneSession(auth, {
                userId: user.id,
                headers: input.headers,
            });
        } catch (error) {
            // A hold or a demo business (`mayStartSession`) refused it.
            if (error instanceof Error && "statusCode" in error) {
                this.blocked("sign_in", "session_refused", keys);
                throw new HttpException(
                    {
                        message:
                            "This account can't be signed in to right now. Use your email, or ask Saroh for help.",
                        details: { code: "SESSION_REFUSED" },
                    },
                    HttpStatus.FORBIDDEN,
                );
            }
            throw error;
        }
        await record("SIGNED_IN", keys, { userId: user.id });
        return headers;
    }

    /** Add or change the signed-in person's phone, after a fresh verify. */
    async add(input: {
        userId: string;
        phoneE164: string;
        proof: PhoneProof;
        ip?: string;
    }): Promise<{ phoneE164: string; phoneVerifiedAt: Date }> {
        const keys = this.keys(input.phoneE164, input.ip);
        const phone = await this.verified(input, "ADD", keys);
        const taken = await prisma.user.findFirst({
            where: { phoneE164: phone, id: { not: input.userId } },
            select: { id: true },
        });
        if (taken) throw phoneTaken();
        const before = await prisma.user.findUnique({
            where: { id: input.userId },
            select: { phoneE164: true },
        });
        const phoneVerifiedAt = new Date();
        try {
            await prisma.user.update({
                where: { id: input.userId },
                data: { phoneE164: phone, phoneVerifiedAt },
            });
        } catch (error) {
            // Another account saved it between the read and the write.
            if (prismaErrorCode(error) === "P2002") throw phoneTaken();
            throw error;
        }
        await record("PHONE_ADDED", keys, {
            userId: input.userId,
            reason: before?.phoneE164 ? "changed" : "added",
        });
        return { phoneE164: phone, phoneVerifiedAt };
    }

    /** Remove the signed-in person's phone. Their email still signs them in. */
    async remove(input: { userId: string; ip?: string }): Promise<void> {
        const before = await prisma.user.findUnique({
            where: { id: input.userId },
            select: { phoneE164: true },
        });
        if (!before?.phoneE164) return;
        await prisma.user.update({
            where: { id: input.userId },
            data: { phoneE164: null, phoneVerifiedAt: null },
        });
        await record("PHONE_REMOVED", this.keys(before.phoneE164, input.ip), {
            userId: input.userId,
        });
    }

    /**
     * The failure caps, then the server's own check: the WhatsApp code
     * against its stored hash, or the widget's token with the provider.
     * Every failed check, of either kind, is a row the caps count.
     */
    private async verified(
        input: { phoneE164: string; proof: PhoneProof; userId?: string },
        purpose: "SIGN_IN" | "ADD",
        keys: Keys,
    ): Promise<string> {
        const verdict = await checkFailures(keys);
        if (!verdict.allowed) {
            this.blocked("verify", verdict.reason, keys);
            throw tooMany(verdict);
        }
        if ("code" in input.proof) {
            const outcome = await checkCode({
                phoneHash: keys.phoneHash,
                code: input.proof.code,
                purpose,
                userId: purpose === "ADD" ? input.userId : undefined,
            });
            if (outcome === "ok") return input.phoneE164;
            await this.fail(keys, outcome);
            throw codeRefused(outcome);
        }
        const result = await this.messaging.verifyOtp({
            accessToken: input.proof.accessToken,
            expectedE164: input.phoneE164,
        });
        if (result.ok) return input.phoneE164;
        if (result.reason === "unavailable") {
            this.blocked("verify", "unavailable", keys);
            throw new ServiceUnavailableException({
                message: "Couldn't check the code just now. Try again.",
                details: { code: "UNAVAILABLE" },
            });
        }
        await this.fail(keys, result.reason);
        throw new BadRequestException({
            message: "That code couldn't be confirmed. Send a new one.",
            details: { code: "NOT_VERIFIED" },
        });
    }

    /**
     * Turnstile, when it is on. A resend from the code step carries no
     * token: it passes when this number, from this address, passed the
     * challenge within the code's lifetime. The start limits still apply.
     */
    private async challenged(
        input: { turnstileToken?: string; ip?: string },
        keys: Keys,
    ): Promise<boolean> {
        if (!this.challenge.configured) return true;
        if (input.turnstileToken) {
            return this.challenge.verify(input.turnstileToken, input.ip ?? "");
        }
        if (!keys.ipHash) return false;
        const recent = await prisma.accountPhoneEvent.findFirst({
            where: {
                kind: "START",
                phoneHash: keys.phoneHash,
                ipHash: keys.ipHash,
                createdAt: { gt: new Date(Date.now() - CODE_MINUTES * 60_000) },
            },
            select: { id: true },
        });
        return recent !== null;
    }

    /**
     * Make a code, send it from Saroh's number, keep its hash. A send that
     * fails is still a start for the daily and address caps, but not for
     * the 30-second cooldown: it was our failure, not the person's.
     */
    private async sendWhatsapp(
        input: { phoneE164: string; purpose: PhonePurpose; userId?: string },
        keys: Keys,
    ): Promise<PhoneStart> {
        const code = newCode();
        let reason: string;
        try {
            const result = await this.messaging.sendOtp({
                toE164: input.phoneE164,
                code,
                appName: "Saroh",
                minutes: CODE_MINUTES,
            });
            reason =
                result.outcome === "accepted"
                    ? ""
                    : result.outcome === "ineligible"
                      ? "not_on_whatsapp"
                      : result.reason;
        } catch {
            reason = "transport_error";
        }
        if (reason) {
            this.blocked("start", `whatsapp_${reason}`, keys);
            await record("START", keys, { reason: `whatsapp_${reason}` });
            throw new UnprocessableEntityException({
                message: "Couldn't send on WhatsApp. Try SMS instead.",
                details: { code: "WHATSAPP_FAILED" },
            });
        }
        await saveCode({
            phoneHash: keys.phoneHash,
            code,
            purpose: input.purpose === "add" ? "ADD" : "SIGN_IN",
            userId: input.purpose === "add" ? input.userId : undefined,
        });
        await record("START", keys);
        return { whatsapp: { resendAfterSeconds: START_COOLDOWN_SECONDS } };
    }

    private async fail(keys: Keys, reason: string): Promise<void> {
        this.blocked("verify", reason, keys);
        await record("VERIFY_FAILED", keys, { reason });
    }

    private blocked(step: string, reason: string, keys: Keys): void {
        this.logger.warn(
            `account_phone_blocked step=${step} reason=${reason} phone=${keys.phoneHash.slice(0, 12)} ip=${keys.ipHash?.slice(0, 12) ?? "none"}`,
        );
    }

    private keys(phoneE164: string, ip?: string): Keys {
        return { phoneHash: numberHash(phoneE164), ipHash: hashClientIp(ip) };
    }
}

interface Keys {
    phoneHash: string;
    ipHash?: string;
}

function record(
    kind: AccountPhoneEventKind,
    keys: Keys,
    extra: { userId?: string; reason?: string } = {},
) {
    return prisma.accountPhoneEvent.create({
        data: {
            kind,
            phoneHash: keys.phoneHash,
            ipHash: keys.ipHash ?? null,
            ...extra,
        },
        select: { id: true },
    });
}

/** A WhatsApp code that didn't check out, in the code step's words. */
function codeRefused(outcome: Exclude<CodeCheck, "ok">): BadRequestException {
    if (outcome === "wrong_code") {
        return new BadRequestException({
            message: "That code isn't right. Check the message and try again.",
            details: { code: "NOT_VERIFIED" },
        });
    }
    // The code step words these two itself and offers "Send a new code".
    return new BadRequestException(
        outcome === "too_many_attempts"
            ? {
                  message: "Too many wrong codes. Send a new one.",
                  details: { code: "TOO_MANY_ATTEMPTS" },
              }
            : {
                  message: "That code has expired. Send a new one.",
                  details: { code: "OTP_EXPIRED" },
              },
    );
}

function phoneTaken(): ConflictException {
    return new ConflictException({
        message:
            "That phone is already on another Saroh account. Use a different one.",
        details: { code: "PHONE_TAKEN", field: "phone" },
    });
}

function tooMany(
    verdict: Extract<LimitVerdict, { allowed: false }>,
): HttpException {
    const wait = verdict.retryAfterSeconds;
    const minutes = Math.ceil(wait / 60);
    const when =
        wait < 60
            ? `in ${wait} seconds`
            : minutes < 120
              ? `in ${minutes} minutes`
              : "tomorrow";
    return new HttpException(
        {
            message: `Too many tries for now. Try again ${when}.`,
            details: { code: "TOO_MANY", retryAfter: wait },
        },
        HttpStatus.TOO_MANY_REQUESTS,
    );
}
