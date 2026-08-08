import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

export interface JoinWaitlistInput {
    email: string;
    source?: string;
    ipHash?: string;
}

export interface JoinWaitlistResult {
    /** False when this email was already on the list. */
    created: boolean;
}

/**
 * Pre-launch waitlist capture.
 *
 * The surface is deliberately tiny and write-only: an anonymous caller can add
 * an email and learn nothing else. There is no read endpoint here — "who is
 * waiting" is an operator question, and exposing it unauthenticated on the same
 * controller is how a competitor gets your pipeline.
 */
@Injectable()
export class WaitlistService {
    private readonly logger = new Logger(WaitlistService.name);

    /**
     * Idempotent by email.
     *
     * A repeat submission must not 500 on the unique index, and must not tell
     * the caller anything different from a first submission — the controller
     * returns the same shape either way. `created` exists for logging and for
     * the caller to decide on copy ("you're on the list" vs "you're already on
     * it"), which is friendly rather than sensitive: anyone can already test an
     * address by submitting it.
     */
    async join(input: JoinWaitlistInput): Promise<JoinWaitlistResult> {
        // Normalized again here rather than trusting the DTO: this service is
        // also reachable from future internal callers (an import, a CLI) that
        // do not go through class-validator.
        const email = input.email.trim().toLowerCase();

        const existing = await prisma.waitlistSignup.findUnique({
            where: { email },
            select: { id: true },
        });

        if (existing) {
            this.logger.log(`waitlist: repeat signup for ${maskEmail(email)}`);
            return { created: false };
        }

        try {
            await prisma.waitlistSignup.create({
                data: {
                    email,
                    source: input.source ?? null,
                    ipHash: input.ipHash ?? null,
                },
            });
        } catch (reason) {
            // Two concurrent first-submissions both pass the findUnique above
            // and race to insert; the loser hits the unique index. That is the
            // same outcome the caller wanted, so treat it as a repeat rather
            // than surfacing a 500.
            if (isUniqueViolation(reason)) {
                return { created: false };
            }
            throw reason;
        }

        this.logger.log(`waitlist: new signup ${maskEmail(email)}`);
        return { created: true };
    }
}

function isUniqueViolation(reason: unknown): boolean {
    return (
        typeof reason === "object" &&
        reason !== null &&
        (reason as { code?: string }).code === "P2002"
    );
}

/**
 * Logs are not the place for a full address. Keeps enough to correlate a
 * support report without putting the list in the log aggregator.
 */
function maskEmail(email: string): string {
    const [local = "", domain = ""] = email.split("@");
    const head = local.slice(0, 2);
    return `${head}${"*".repeat(Math.max(local.length - 2, 0))}@${domain}`;
}
