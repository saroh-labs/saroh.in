import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpException,
    HttpStatus,
    Injectable,
    Optional,
    ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma, prisma, runInOrgContext } from "@saroh/database";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { assertOrganizationWindingDown } from "../organizations/organization-lifecycle.gate";
import { AccountLinkingService } from "./account-linking.service";
import { ChallengeVerifier } from "./challenge";
import { SiteCodeAlerts, SiteCodeDelivery } from "./code-delivery";
import {
    ceilingsFor,
    challengeLikely,
    CODE_MAX_ATTEMPTS,
    CODE_TTL_MS,
    decideCodeRequest,
    loadBusinessCounts,
    loadCodeCounts,
    OWN_RESEND_MS,
} from "./code-limits";
import { normaliseAccountEmail } from "./customer-account.repository";
import type { RequestCodeDto, VerifyCodeDto } from "./dto";
import { cleanBusinessName } from "./sender-name";
import type { SessionIssued } from "./sessions.service";
import { SessionsService } from "./sessions.service";
import type { SiteHost } from "./site-host";
import { businessPublicPhone, resolveSiteHost } from "./site-host";
import type { SiteRelay } from "./site-relay";
import { siteCodeSecret } from "./site-secrets";

/**
 * Sign-in codes for a business's customers on its own site (ADR-011,
 * DEC-037; round-2 plan A, A2).
 *
 * Every call arrives from the site's server with a checked relay (the host
 * it served and the visitor's address). The host resolves to the site and
 * its business first; everything after runs inside that business's RLS
 * context, and nothing in a body can name another.
 *
 * The code and its destination are stored only as HMACs under a server
 * secret; the session token only as its SHA-256. A code lives 10 minutes
 * and allows 5 tries. Answers never say whether an email had an account.
 */

/** What `codes` answers, the same for every email. */
export interface CodeRequested {
    sent: true;
    expiresInSeconds: number;
    resendAfterSeconds: number;
}

export type { SessionIssued } from "./sessions.service";

/** What the sign-in sheet needs before anything is typed. */
export interface SignInOptions {
    businessName: string;
    /** The business's public phone, for "Or call ‹Business› on ‹phone›". */
    phone: string | null;
    challenge: { required: boolean; siteKey: string | null };
}

/**
 * The in-process limits, set generously. Neither refuses a customer for what
 * someone else did (offices and mobile networks share addresses, and one
 * address visits many businesses' sites):
 *
 * - code requests are counted per business and visitor address, and past
 *   the limit a code needs the challenge rather than being refused — when
 *   Turnstile is configured. Without it that challenge could not be asked,
 *   so past the limit the address waits out the window (429 `limit`);
 * - verify tries are counted per business, email and visitor address — only
 *   the visitor's own tries at their own email — and past it they wait.
 *
 * The durable limits are the rows (code-limits).
 */
const CODE_REQUESTS_PER_ADDRESS = 30;
const VERIFY_TRIES_PER_ADDRESS = 60;
const ADDRESS_WINDOW_MS = 10 * 60_000;

export const UNAVAILABLE_MESSAGE =
    "We couldn't send your code — try again in a few minutes";

function hmac(parts: string[]): string {
    return createHmac("sha256", siteCodeSecret())
        .update(parts.join("\n"))
        .digest("hex");
}

/** The destination's keyed hash, per business. */
export function destinationHashFor(
    organizationId: string,
    email: string,
): string {
    return hmac(["dest", organizationId, normaliseAccountEmail(email)]);
}

/**
 * The destination's keyed hash for an email change (A5): bound to the
 * account as well as the email, so the code can only change that account's
 * email, and a sign-in for the same email can never use it.
 */
export function changeDestinationHashFor(
    organizationId: string,
    accountId: string,
    email: string,
): string {
    return hmac([
        "change",
        organizationId,
        accountId,
        normaliseAccountEmail(email),
    ]);
}

/** The code's keyed hash, bound to its business and destination. */
export function codeHashFor(
    organizationId: string,
    destinationHash: string,
    code: string,
): string {
    return hmac(["code", organizationId, destinationHash, code]);
}

function sameHash(a: string, b: string): boolean {
    const x = Buffer.from(a, "hex");
    const y = Buffer.from(b, "hex");
    return x.length === y.length && timingSafeEqual(x, y);
}

function limited(
    reason: "limit" | "wait",
    retryAfterSeconds: number,
): HttpException {
    const minutes = Math.ceil(retryAfterSeconds / 60);
    const message =
        retryAfterSeconds < 60
            ? `Try again in ${retryAfterSeconds} seconds`
            : `Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
    return new HttpException(
        { message, details: { reason, retryAfter: retryAfterSeconds } },
        HttpStatus.TOO_MANY_REQUESTS,
    );
}

function wrongCode(reason: "invalid" | "expired"): BadRequestException {
    return new BadRequestException({
        message:
            reason === "expired"
                ? "That code has expired. Ask for a new one."
                : "That code isn't right. Check the email and try again.",
        details: { reason },
    });
}

@Injectable()
export class SignInCodesService {
    constructor(
        private readonly linking: AccountLinkingService,
        private readonly sessions: SessionsService,
        private readonly delivery: SiteCodeDelivery,
        private readonly challenge: ChallengeVerifier,
        private readonly alerts: SiteCodeAlerts,
        @Optional()
        private readonly codeLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            CODE_REQUESTS_PER_ADDRESS,
            ADDRESS_WINDOW_MS,
        ),
        @Optional()
        private readonly verifyLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            VERIFY_TRIES_PER_ADDRESS,
            ADDRESS_WINDOW_MS,
        ),
    ) {}

    async options(relay: SiteRelay): Promise<SignInOptions> {
        const site = await resolveSiteHost(relay.host);
        return runInOrgContext(site.organizationId, async () => {
            const now = new Date();
            const counts = await loadBusinessCounts(
                prisma,
                site.organizationId,
                now,
            );
            const likely = challengeLikely(
                counts.businessNewLastHour,
                counts.businessToday,
                ceilingsFor(site.businessCreatedAt, now),
            );
            return {
                businessName: site.businessName,
                phone: await businessPublicPhone(site),
                challenge: {
                    required: likely && this.challenge.configured,
                    siteKey: this.challenge.siteKey,
                },
            };
        });
    }

    async requestCode(
        relay: SiteRelay,
        dto: RequestCodeDto,
    ): Promise<CodeRequested> {
        const site = await resolveSiteHost(relay.host);
        return runInOrgContext(site.organizationId, async () => {
            // Signing in to see, pay or cancel what they already have
            // stays open while the business winds down (DEC-117).
            await assertOrganizationWindingDown(site.organizationId);
            const now = new Date();
            const email = normaliseAccountEmail(dto.email);
            const destinationHash = destinationHashFor(
                site.organizationId,
                email,
            );

            // No challenge to ask, so past the address limit is a refusal:
            // the one hard stop on one address asking this business for
            // code after code (A-2).
            const addressBusy = this.takeAddress(site, relay, now);

            const returning = await prisma.customerAccount.count({
                where: {
                    organizationId: site.organizationId,
                    email,
                    status: { in: ["ACTIVE", "MERGED"] },
                },
            });
            return this.sendCode(site, relay, email, {
                destinationHash,
                newDestination: returning === 0,
                addressBusy,
                challenge: dto.challenge,
                now,
            });
        });
    }

    /**
     * Send a code to `email` under `destinationHash`, after the limits
     * (code-limits) and the challenge they may ask for. Runs inside the
     * caller's `runInOrgContext`. Sign-in keys the destination by email
     * (`destinationHashFor`); an email change keys it by account and email
     * (`changeDestinationHashFor`, A5), so a change code never signs anyone
     * in and a sign-in code never changes an email.
     */
    async sendCode(
        site: SiteHost,
        relay: SiteRelay,
        email: string,
        input: {
            destinationHash: string;
            newDestination: boolean;
            addressBusy: boolean;
            challenge: string | undefined;
            now: Date;
        },
    ): Promise<CodeRequested> {
        const { destinationHash, newDestination, addressBusy, now } = input;
        const decision = decideCodeRequest({
            counts: await loadCodeCounts(prisma, {
                organizationId: site.organizationId,
                destinationHash,
                clientHash: relay.clientHash,
                now,
            }),
            newDestination,
            ceilings: ceilingsFor(site.businessCreatedAt, now),
            addressBusy,
            now,
        });
        if (decision.kind !== "send") {
            throw limited(
                decision.kind === "refuse" ? "limit" : "wait",
                decision.retryAfterSeconds,
            );
        }
        for (const alert of decision.alerts) {
            this.alerts.ceilingPassed(site.organizationId, alert);
        }
        if (decision.challenge) {
            await this.passChallenge(site, relay, input.challenge);
        }

        return this.issueCode(site, relay, email, {
            destinationHash,
            newDestination,
            now,
        });
    }

    /**
     * The in-process per-address limit for code requests: true when this
     * address is past it. Past it with no challenge configured is a 429
     * (the one hard stop, A-2); with one, the limits ask for the challenge.
     */
    takeAddress(site: SiteHost, relay: SiteRelay, now: Date): boolean {
        const addressKey = `${site.organizationId}:${relay.clientHash}`;
        const busy = !this.codeLimiter.take(addressKey, now.getTime());
        if (busy && !this.challenge.configured) {
            throw limited(
                "limit",
                this.codeLimiter.retryAfterSeconds(addressKey, now.getTime()),
            );
        }
        return busy;
    }

    /**
     * The per-address limit on verify tries, keyed by the destination: only
     * the visitor's own tries at their own code count (429 past it).
     */
    takeVerifyTry(
        site: SiteHost,
        relay: SiteRelay,
        destinationHash: string,
        now: Date,
    ): void {
        const tries = `${site.organizationId}:${destinationHash}:${relay.clientHash}`;
        if (!this.verifyLimiter.take(tries, now.getTime())) {
            throw limited(
                "limit",
                this.verifyLimiter.retryAfterSeconds(tries, now.getTime()),
            );
        }
    }

    async verifyCode(
        relay: SiteRelay,
        dto: VerifyCodeDto,
    ): Promise<SessionIssued> {
        const site = await resolveSiteHost(relay.host);
        return runInOrgContext(site.organizationId, async () => {
            // Signing in to see, pay or cancel what they already have
            // stays open while the business winds down (DEC-117).
            await assertOrganizationWindingDown(site.organizationId);
            const now = new Date();
            const email = normaliseAccountEmail(dto.email);
            const destinationHash = destinationHashFor(
                site.organizationId,
                email,
            );
            this.takeVerifyTry(site, relay, destinationHash, now);
            await this.consumeCode(
                site.organizationId,
                destinationHash,
                dto.code,
                now,
            );
            return this.openSession(site, email, now);
        });
    }

    private async passChallenge(
        site: SiteHost,
        relay: SiteRelay,
        token: string | undefined,
    ): Promise<void> {
        if (!this.challenge.configured) {
            // Never strand a customer on a widget the site can't show.
            this.alerts.challengeUnconfigured(site.organizationId);
            return;
        }
        if (!(await this.challenge.verify(token, relay.address))) {
            throw new BadRequestException({
                message:
                    "Confirm you're not a robot, then ask for the code again.",
                details: {
                    reason: "challenge",
                    siteKey: this.challenge.siteKey,
                },
            });
        }
    }

    private async issueCode(
        site: SiteHost,
        relay: SiteRelay,
        email: string,
        input: { destinationHash: string; newDestination: boolean; now: Date },
    ): Promise<CodeRequested> {
        const { destinationHash, newDestination, now } = input;
        const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
        const row = await prisma.customerSignInCode.create({
            data: {
                organizationId: site.organizationId,
                destinationHash,
                codeHash: codeHashFor(
                    site.organizationId,
                    destinationHash,
                    code,
                ),
                expiresAt: new Date(now.getTime() + CODE_TTL_MS),
                clientHash: relay.clientHash,
                newDestination,
            },
            select: { id: true, createdAt: true },
        });

        const sent = await this.delivery.deliver(site.organizationId, email, {
            code,
            businessName: cleanBusinessName(site.businessName, site.host),
            minutes: CODE_TTL_MS / 60_000,
        });
        if (!sent) {
            // The code never left: nothing may be left live for it, and the
            // customer's last code (if any) stays as it was.
            await prisma.customerSignInCode.deleteMany({
                where: { id: row.id, organizationId: site.organizationId },
            });
            throw new ServiceUnavailableException({
                message: UNAVAILABLE_MESSAGE,
                details: { reason: "unavailable" },
            });
        }

        // A new code retires the older live ones for the same email. Only
        // older ones: of two requests at once, the newer code survives.
        await prisma.customerSignInCode.updateMany({
            where: {
                organizationId: site.organizationId,
                destinationHash,
                id: { not: row.id },
                createdAt: { lte: row.createdAt },
                consumedAt: null,
                retiredAt: null,
            },
            data: { retiredAt: now },
        });

        return {
            sent: true,
            expiresInSeconds: CODE_TTL_MS / 1000,
            resendAfterSeconds: OWN_RESEND_MS / 1000,
        };
    }

    /**
     * Check and use up the live code for `destinationHash`, or say why not
     * (400). Runs inside the caller's `runInOrgContext`.
     */
    async consumeCode(
        organizationId: string,
        destinationHash: string,
        code: string,
        now: Date,
    ): Promise<void> {
        const live = await prisma.customerSignInCode.findFirst({
            where: {
                organizationId,
                destinationHash,
                consumedAt: null,
                retiredAt: null,
            },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                codeHash: true,
                expiresAt: true,
                attempts: true,
            },
        });
        if (!live || live.attempts >= CODE_MAX_ATTEMPTS) {
            throw wrongCode("expired");
        }
        if (live.expiresAt <= now) throw wrongCode("expired");

        // Count the try before comparing, under a guard, so parallel guesses
        // cannot spend more than the five tries between them.
        const counted = await prisma.customerSignInCode.updateMany({
            where: {
                id: live.id,
                organizationId,
                attempts: { lt: CODE_MAX_ATTEMPTS },
                consumedAt: null,
            },
            data: { attempts: { increment: 1 } },
        });
        if (counted.count === 0) throw wrongCode("expired");

        const given = codeHashFor(organizationId, destinationHash, code);
        if (!sameHash(given, live.codeHash)) {
            throw wrongCode(
                live.attempts + 1 >= CODE_MAX_ATTEMPTS ? "expired" : "invalid",
            );
        }
        const used = await prisma.customerSignInCode.updateMany({
            where: { id: live.id, organizationId, consumedAt: null },
            data: { consumedAt: now },
        });
        if (used.count === 0) throw wrongCode("expired");
    }

    /** Sign in (or up), and hand back a new session's token once. */
    private async openSession(
        site: SiteHost,
        email: string,
        now: Date,
    ): Promise<SessionIssued> {
        const run = () =>
            prisma.$transaction(async (tx) => {
                const identity = await this.linking.linkOrCreate(
                    tx,
                    site.organizationId,
                    email,
                    now,
                );
                if (identity.kind === "merged") {
                    throw new ConflictException({
                        message: `This email now signs in as ${identity.maskedEmail}`,
                        details: {
                            reason: "merged",
                            signsInAs: identity.maskedEmail,
                        },
                    });
                }
                if (identity.kind === "blocked") {
                    throw new ForbiddenException({
                        message:
                            "You can't sign in here. Please contact the business.",
                        details: { reason: "blocked" },
                    });
                }
                return this.sessions.create(tx, {
                    organizationId: site.organizationId,
                    siteId: site.siteId,
                    accountId: identity.account.id,
                    now,
                });
            });
        try {
            return await run();
        } catch (error) {
            // Two first sign-ins for one new email: the other made the
            // contact first. Once more finds it (account-linking.service).
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002"
            ) {
                return run();
            }
            throw error;
        }
    }
}
