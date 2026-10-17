import type { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

type Tx = Pick<Prisma.TransactionClient, "adminOrganizationNote">;

/**
 * Who wrote an automatic operator note: no operator, so the admin console
 * reads its author as "An operator" and the note says it was automatic.
 */
export const BILLING_NOTE_AUTHOR = "billing-provider";

/**
 * Something about Saroh's billing an operator must act on by hand — a
 * payment to refund, a provider subscription that won't cancel — raised
 * where operators look: an ERROR log line by its code (error tracking picks
 * it up) and a note on the business in the admin console
 * (`AdminOrganizationNote`, read only there; the business never sees it).
 * Written on the caller's transaction, so it stands or falls with the
 * change that found it. Never carries a credential or a card detail: ids
 * and Saroh's own words only.
 */
export async function raiseBillingOpsNoticeInTx(
    tx: Tx,
    logger: Pick<Logger, "error">,
    input: {
        /** The log code, e.g. `billing_paid_on_dropped_checkout`. */
        code: string;
        organizationId: string;
        /** Ids an operator follows it by (provider ids, the checkout). */
        refs: Record<string, string | null | undefined>;
        /** What happened and what to do, for the note. */
        note: string;
    },
): Promise<void> {
    logger.error(
        `${input.code} org=${input.organizationId} ${refsLine(input.refs)}`.trim(),
    );
    await addBillingNoteInTx(tx, input);
}

const refsLine = (refs: Record<string, string | null | undefined>) =>
    Object.entries(refs)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");

/**
 * A note on the business in the admin console for something Saroh's
 * billing did on its own that an operator should know of but needn't act
 * on (a double charge refunded automatically): the same note as
 * {@link raiseBillingOpsNoticeInTx}, without the ERROR log.
 */
export async function addBillingNoteInTx(
    tx: Tx,
    input: {
        organizationId: string;
        refs: Record<string, string | null | undefined>;
        note: string;
    },
): Promise<void> {
    const refs = refsLine(input.refs);
    await tx.adminOrganizationNote.create({
        data: {
            organizationId: input.organizationId,
            authorUserId: BILLING_NOTE_AUTHOR,
            body: `Billing (automatic): ${input.note}${refs ? `\n${refs}` : ""}`,
        },
    });
}
