import type { Prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditAction } from "../audit/audit.service";
import {
    changesWords,
    nextRequestStatus,
    storedRuleChanges,
} from "../bookings/person-rules";
import type { AnswerOutcome } from "../notifications/ask-alerts";
import {
    answerTitle,
    RULE_ANSWER_NOTIFICATION_TYPE,
    RULE_REQUEST_NOTIFICATION_TYPE,
} from "../notifications/ask-alerts";
import { noticeOf } from "../notifications/notice-target";
import { enqueueTeamAlert } from "../notifications/team-alerts";
import { recordPersonRulesInTx } from "./rules-history";

/**
 * Telling the person who asked how their rules request ended, and closing
 * a waiting request that a newer change has made moot (DEC-170, owner 20
 * Oct 2026).
 *
 * A waiting request is closed as "Replaced by a newer change" (`REPLACED`)
 * when that person's rules are changed directly by someone allowed to, or
 * when the business switches "Members' rule changes need approval" off.
 * The person hears it as they hear an approval or a turn-down: a notice in
 * their own alerts (`userId`, `notification:read-own`) and an email queued
 * beside it (`ask-alerts.ts`), both on the closing transaction.
 */

type Tx = Prisma.TransactionClient;

/** Why a waiting request was closed. */
export type ReplacedBecause = "rules-changed" | "approval-off";

/** A request row, as much of it as telling its asker needs. */
interface AskedRow {
    id: string;
    staffId: string;
    requestedByUserId: string;
    changes: unknown;
}

/**
 * A notice in the asker's own alerts, and the email queued with it:
 * `body` is what the bell says under the title.
 */
export async function tellAskerInTx(
    tx: Tx,
    organizationId: string,
    row: AskedRow,
    outcome: AnswerOutcome,
    body: string,
): Promise<void> {
    const notice = await tx.notification.create({
        data: {
            organizationId,
            userId: row.requestedByUserId,
            ...noticeOf(RULE_ANSWER_NOTIFICATION_TYPE, {
                staffId: row.staffId,
            }),
            title: answerTitle(outcome),
            body,
        },
        select: { id: true },
    });
    await enqueueTeamAlert(tx, organizationId, {
        event: "ask",
        about: "rules",
        requestId: row.id,
        step: "answered",
        notificationId: notice.id,
    });
}

/**
 * Take a person's rules request off the bell (#1138): the business's
 * notice that it waits, once it is approved, turned down, withdrawn or
 * replaced. Deleted rather than marked read, so it leaves the list too:
 * the answer is the asker's own notice, and the history keeps the rest.
 * On the closing transaction. Answers how many were removed.
 */
export async function clearRequestNoticeInTx(
    tx: Tx,
    organizationId: string,
    staffId: string,
): Promise<number> {
    const { count } = await tx.notification.deleteMany({
        where: {
            organizationId,
            userId: null,
            type: RULE_REQUEST_NOTIFICATION_TYPE,
            staffId,
        },
    });
    return count;
}

/** The bell's words for a request closed by a newer change. */
export function replacedBody(
    asked: readonly string[],
    because: ReplacedBecause,
): string {
    const what = asked.join(" · ");
    return because === "approval-off"
        ? `${what}. Changes to your own rules no longer need approval, so nothing in it was applied. You can change them yourself now.`
        : `${what}. Your booking rules were changed directly, so nothing in it was applied.`;
}

/**
 * Lock the requests waiting in this business, or for one person. Taken
 * before the person's own row (`StaffMember`), in the order an approval
 * takes them, so a direct change and an approval can't deadlock.
 */
export async function lockWaitingInTx(
    tx: Tx,
    organizationId: string,
    staffId?: string,
): Promise<string[]> {
    const rows = staffId
        ? await tx.$queryRaw<{ id: string }[]>`
              SELECT id FROM "StaffRuleRequest"
              WHERE "organizationId" = ${organizationId}
                AND "staffId" = ${staffId} AND status = 'WAITING'
              FOR UPDATE`
        : await tx.$queryRaw<{ id: string }[]>`
              SELECT id FROM "StaffRuleRequest"
              WHERE "organizationId" = ${organizationId}
                AND status = 'WAITING'
              ORDER BY id
              FOR UPDATE`;
    return rows.map((r) => r.id);
}

/**
 * Close the locked requests (`lockWaitingInTx`) that still wait as
 * "Replaced by a newer change", tell each person, and write each into the
 * history. Answers how many were closed.
 */
export async function replaceWaitingInTx(
    tx: Tx,
    ctx: OrganizationContext,
    requestIds: readonly string[],
    because: ReplacedBecause,
): Promise<number> {
    let closed = 0;
    for (const id of requestIds) {
        const row = await tx.staffRuleRequest.findFirst({
            where: { id, organizationId: ctx.organizationId },
            include: { staff: { select: { id: true, name: true } } },
        });
        const next = row ? nextRequestStatus(row.status, "supersede") : null;
        if (!row || !next) continue;
        await tx.staffRuleRequest.update({
            where: { id: row.id },
            data: {
                status: next,
                decidedAt: new Date(),
                decidedByUserId: ctx.userId,
            },
            select: { id: true },
        });
        const asked = changesWords(storedRuleChanges(row.changes));
        await clearRequestNoticeInTx(tx, ctx.organizationId, row.staffId);
        await tellAskerInTx(
            tx,
            ctx.organizationId,
            row,
            "REPLACED",
            replacedBody(asked, because),
        );
        await recordPersonRulesInTx(tx, ctx, row.staff, {
            action: AuditAction.StaffRulesReplaced,
            requestId: row.id,
            because,
        });
        closed += 1;
    }
    return closed;
}
