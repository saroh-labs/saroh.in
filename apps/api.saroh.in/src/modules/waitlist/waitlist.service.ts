import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import type { WaitlistKind, WaitlistPlan } from "./waitlist-keys";
import {
    businessKey,
    cleanSource,
    maskEmail,
    newRefCode,
    normaliseEmail,
    REF_CODE_PATTERN,
} from "./waitlist-keys";

export interface JoinWaitlistInput {
    email: string;
    /** The V2 form's fields; absent from the V1 form, which asks for an email only. */
    business?: string;
    kind?: WaitlistKind;
    city?: string;
    /** Two letters, as the site's host saw the visitor's connection. */
    country?: string;
    plan?: WaitlistPlan;
    source?: string;
    /** The referral id from the visitor's link. */
    ref?: string;
    ipHash?: string;
}

/**
 * A new entry carries its place and its referral id; a repeat carries
 * neither (plan D-8). Showing the place again would let anyone who knows an
 * address look up its place and link.
 */
export type JoinWaitlistResult =
    | { created: true; position: number; refCode: string | null }
    | { created: false };

/** How many times a clashing referral id is drawn again. */
const REF_CODE_ATTEMPTS = 3;

/**
 * Pre-launch waitlist capture (U30, plan KTD-17).
 *
 * The surface is deliberately tiny and write-only: an anonymous caller can add
 * an entry and learn its own place, nothing else. There is no read endpoint
 * here — "who is waiting" is an operator question (`waitlist:read` in the
 * console), and exposing it unauthenticated is how a competitor gets your
 * pipeline.
 *
 * Nothing is emailed on join: the page promises one email, on opening day
 * (U31 sends it).
 */
@Injectable()
export class WaitlistService {
    private readonly logger = new Logger(WaitlistService.name);

    /**
     * Idempotent per normalised email and business (OQ-11: one owner may list
     * a second business). A repeat must not 500 on the unique index, and must
     * not hand back the existing entry's place or link.
     */
    async join(input: JoinWaitlistInput): Promise<JoinWaitlistResult> {
        // Normalised again here rather than trusting the DTO: this service is
        // also reachable from future internal callers (an import, a CLI) that
        // do not go through class-validator.
        const { email, key } = normaliseEmail(input.email);
        const businessName = textOrNull(input.business);
        const bKey = businessKey(businessName);

        if (await this.exists(key, bKey)) {
            this.logger.log(`waitlist: repeat signup for ${maskEmail(email)}`);
            return { created: false };
        }

        const referredById = await this.referrer(input.ref, key, input.ipHash);
        const data = {
            email,
            emailKey: key,
            businessKey: bKey,
            businessName,
            kind: businessName ? (input.kind ?? null) : null,
            city: textOrNull(input.city),
            country: input.country ?? null,
            plan: input.plan ?? null,
            source: cleanSource(input.source),
            referredById,
            ipHash: input.ipHash ?? null,
        };

        for (let attempt = 0; attempt < REF_CODE_ATTEMPTS; attempt += 1) {
            try {
                const row = await prisma.waitlistSignup.create({
                    // A link is for the V2 done state; the V1 form shows none.
                    data: {
                        ...data,
                        refCode: businessName ? newRefCode() : null,
                    },
                    select: { position: true, refCode: true },
                });
                this.logger.log(
                    `waitlist: new signup ${maskEmail(email)}${referredById ? " (referred)" : ""}`,
                );
                return {
                    created: true,
                    position: row.position,
                    refCode: row.refCode,
                };
            } catch (reason) {
                if (prismaErrorCode(reason) !== "P2002") throw reason;
                // Two concurrent first joins both pass the check above and race
                // to insert; the loser hits the unique index. That is the
                // outcome the caller wanted, so it is a repeat, not a 500.
                // Otherwise the clash was the referral id: draw another.
                if (await this.exists(key, bKey)) return { created: false };
            }
        }
        throw new Error(
            "Could not draw a free referral id for a waitlist entry",
        );
    }

    private async exists(emailKey: string, bKey: string): Promise<boolean> {
        const row = await prisma.waitlistSignup.findUnique({
            where: { emailKey_businessKey: { emailKey, businessKey: bKey } },
            select: { id: true },
        });
        return row !== null;
    }

    /**
     * The entry whose link this is, or null: an unknown or malformed id, or
     * a self-referral — the same person (normalised email) or the same
     * address (ipHash) as the link's owner — credits nobody.
     */
    private async referrer(
        ref: string | undefined,
        emailKey: string,
        ipHash: string | undefined,
    ): Promise<string | null> {
        if (!ref || !REF_CODE_PATTERN.test(ref)) return null;
        const owner = await prisma.waitlistSignup.findUnique({
            where: { refCode: ref },
            select: { id: true, emailKey: true, ipHash: true },
        });
        if (!owner) return null;
        if (owner.emailKey === emailKey) return null;
        if (ipHash && owner.ipHash === ipHash) return null;
        return owner.id;
    }
}

/** Trimmed text with its spaces collapsed, or null when nothing is left. */
function textOrNull(value: string | undefined): string | null {
    const text = value?.trim().replace(/\s+/g, " ");
    return text === undefined || text === "" ? null : text;
}
