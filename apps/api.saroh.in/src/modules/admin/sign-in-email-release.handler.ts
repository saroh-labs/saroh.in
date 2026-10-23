import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { SignInCodeSender } from "../../common/auth/sign-in-code-sender";

/**
 * `people.sign-in-email.release`: the end of a sign-in email change's hold
 * (admin console U9). Queued with the change, to run at `codeHeldUntil`;
 * sends the new address its sign-in code through Better Auth.
 *
 * It re-reads the change and does nothing when a second staff member
 * already confirmed it (their confirm sent the code), when the code went
 * out already, or when the person's address has moved on since. The
 * durable mark (`codeSentAt`) is written before the send, so a retried run
 * never sends twice; a send that fails after it is not retried, and the
 * person asks for a code at sign-in as anyone would.
 */
@Injectable()
export class SignInEmailReleaseHandler {
    private readonly logger = new Logger(SignInEmailReleaseHandler.name);

    constructor(private readonly codes: SignInCodeSender) {}

    readonly handle = async (job: Job): Promise<void> => {
        const changeId = changeIdOf(job.payload);
        if (!changeId) {
            this.logger.warn(`Job ${job.id} names no change; nothing to do.`);
            return;
        }
        const change = await prisma.signInEmailChange.findUnique({
            where: { id: changeId },
            select: {
                id: true,
                userId: true,
                newEmail: true,
                codeHeldUntil: true,
                confirmedAt: true,
                codeSentAt: true,
                user: { select: { email: true } },
            },
        });
        if (!change || change.confirmedAt || change.codeSentAt) return;
        if (change.user.email !== change.newEmail) return;
        if (change.codeHeldUntil.getTime() > Date.now()) {
            // Run early (a clock or a manual retry): try again later.
            throw new Error("The hold has not ended yet.");
        }
        const marked = await prisma.signInEmailChange.updateMany({
            where: { id: change.id, confirmedAt: null, codeSentAt: null },
            data: { codeSentAt: new Date() },
        });
        if (marked.count === 0) return;
        try {
            await this.codes.send(change.newEmail);
        } catch (error) {
            this.logger.error(
                `The released code for ${change.userId} could not be sent: ${
                    error instanceof Error ? error.name : "unknown error"
                }`,
            );
        }
    };
}

function changeIdOf(payload: unknown): string | null {
    if (payload && typeof payload === "object" && "changeId" in payload) {
        const id = payload.changeId;
        return typeof id === "string" && id.length > 0 ? id : null;
    }
    return null;
}
