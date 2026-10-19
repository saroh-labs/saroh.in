import type { Prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { FieldChange } from "../audit/audit-changes";
import { recordableChanges } from "../audit/audit-changes";
import {
    AuditAction,
    auditMetadata,
    AuditOutcome,
} from "../audit/audit.service";
import type { BookingRulesValue } from "../bookings/booking-rules";
import type { PersonRules, RuleChanges } from "../bookings/person-rules";
import { PERSON_RULE_FIELDS } from "../bookings/person-rules";

/**
 * Booking rules in the business's history (DEC-170, #1038): every change to
 * the business's rules and to a person's own, and every move of a request,
 * written in the transaction of the change so none is lost or invented.
 */

type Tx = Pick<Prisma.TransactionClient, "auditEvent">;

const BUSINESS_FIELDS = [
    "bookAheadDays",
    "latestBookingMinutes",
    "freeCancelHours",
    "gapMinutes",
    "refundInTimeCancels",
    "bookingPayment",
    "memberRuleChangesNeedApproval",
] as const satisfies readonly (keyof BookingRulesValue)[];

/** The business's rules as they were and became; nothing when unchanged. */
export async function recordBusinessRulesInTx(
    tx: Tx,
    ctx: OrganizationContext,
    before: BookingRulesValue,
    after: BookingRulesValue,
): Promise<void> {
    const changes = recordableChanges(
        BUSINESS_FIELDS.map((field) => ({
            field,
            before: before[field],
            after: after[field],
        })),
    );
    if (changes.length === 0) return;
    await tx.auditEvent.create({
        data: {
            action: AuditAction.BookingRulesUpdate,
            actorUserId: ctx.userId,
            organizationId: ctx.organizationId,
            targetType: "organization",
            targetId: ctx.organizationId,
            outcome: AuditOutcome.Success,
            metadata: auditMetadata(ctx.roleKey, {
                fields: changes.map((c) => c.field),
                changes: changes as unknown as Prisma.InputJsonArray,
            }),
        },
    });
}

/** A person's own rules as they were and became. */
export function personRuleChanges(
    before: PersonRules,
    after: PersonRules,
): FieldChange[] {
    return recordableChanges(
        PERSON_RULE_FIELDS.map((field) => ({
            field,
            before: before[field],
            after: after[field],
        })),
    );
}

/** What a person's rules row in the history says, beside its action. */
export type PersonRulesEvent =
    | {
          action: typeof AuditAction.StaffRulesUpdate;
          via: "direct" | "approved";
          changes: FieldChange[];
          requestId?: string;
      }
    | {
          action: typeof AuditAction.StaffRulesRequested;
          requestId: string;
          asked: RuleChanges;
      }
    | { action: typeof AuditAction.StaffRulesApproved; requestId: string }
    | {
          action: typeof AuditAction.StaffRulesTurnedDown;
          requestId: string;
          reason: string | null;
      }
    | {
          action: typeof AuditAction.StaffRulesWithdrawn;
          requestId: string;
          replaced?: true;
      };

/** One move on a person's rules, with the person as the target. */
export async function recordPersonRulesInTx(
    tx: Tx,
    ctx: OrganizationContext,
    staff: { id: string; name: string },
    event: PersonRulesEvent,
): Promise<void> {
    const { action, ...rest } = event;
    if (action === AuditAction.StaffRulesUpdate && event.changes.length === 0) {
        return;
    }
    const detail: Record<string, unknown> = { ...rest };
    if (action === AuditAction.StaffRulesUpdate) {
        detail.fields = event.changes.map((c) => c.field);
    }
    await tx.auditEvent.create({
        data: {
            action,
            actorUserId: ctx.userId,
            organizationId: ctx.organizationId,
            targetType: "staffMember",
            targetId: staff.id,
            outcome: AuditOutcome.Success,
            metadata: auditMetadata(ctx.roleKey, {
                staff: staff.name,
                ...detail,
            }),
        },
    });
}
