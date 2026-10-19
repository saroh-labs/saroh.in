import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditAction } from "../audit/audit.service";
import { requireBookingPower } from "../bookings/booking-access";
import { loadBookingRules } from "../bookings/booking-rules";
import { ownDiaryOf } from "../bookings/own-diary";
import type {
    PersonRules,
    RuleChanges,
    RuleRequestMove,
} from "../bookings/person-rules";
import {
    applyRuleChanges,
    changedRules,
    changesWords,
    hasChanges,
    nextRequestStatus,
    personRulesOf,
    requestStatusOf,
    ruleChangeRoute,
    rulesForPerson,
    storedRuleChanges,
} from "../bookings/person-rules";
import {
    answerTitle,
    cleanReason,
    RULE_ANSWER_NOTIFICATION_TYPE,
    RULE_REQUEST_NOTIFICATION_TYPE,
} from "../notifications/ask-alerts";
import { noticeOf } from "../notifications/notice-target";
import { enqueueTeamAlert } from "../notifications/team-alerts";
import { allows } from "../organizations/organization-policy";
import type { UpdatePersonRulesDto } from "./dto";
import { personRuleChanges, recordPersonRulesInTx } from "./rules-history";
import type {
    PersonRulesSaved,
    PersonRulesView,
    RuleRequestView,
} from "./staff-rules-view";
import { outcomeWords, requestViews, timing } from "./staff-rules-view";

const PERSON_SELECT = {
    id: true,
    name: true,
    bookAheadDays: true,
    latestBookingMinutes: true,
    freeCancelHours: true,
    gapMinutes: true,
    membership: { select: { userId: true } },
} as const;

type PersonRow = Prisma.StaffMemberGetPayload<{
    select: typeof PERSON_SELECT;
}>;

const OTHERS_REFUSAL =
    "You can change only your own booking rules. Owners and admins change everyone's.";
const DECIDES_REFUSAL =
    "Only someone who can change the business's booking rules can approve or turn down a request.";

/**
 * Each person's own booking rules, and requests to change them (DEC-170,
 * #1038).
 *
 * - Reading anyone's needs `service:read`; Calendar only reads its own.
 * - Whoever sets up bookings (`service:write`, Owner and Admin) changes
 *   anyone's at once, and approves or turns down requests.
 * - Someone with `hours:write` (a Member) changes only their own. With the
 *   business's "Members' rule changes need approval" on, their change is a
 *   request that changes nothing until approved; off, it applies at once
 *   and Undo is the same `PUT` with `previous`.
 * - A Reviewer, and Calendar only, change nobody's.
 *
 * One request waits per person: asking again replaces it (the old one
 * reads as withdrawn). Every change and every move lands in the
 * business's history (`rules-history.ts`). A new request tells owners and
 * admins in the inbox and by email; an approval or a turn-down tells the
 * person who asked, in their own alerts and by email, with the reason
 * (DEC-170, `notifications/ask-alerts.ts`). The notices are written, and
 * the emails queued, on the request's own transaction.
 */
@Injectable()
export class StaffRulesService {
    async read(
        ctx: OrganizationContext,
        staffId: string,
    ): Promise<PersonRulesView> {
        requireBookingPower(ctx, "service:read");
        const own = await ownDiaryOf(prisma, ctx);
        if (own && own.staffId !== staffId) {
            throw new NotFoundException("Staff member not found");
        }
        const person = await this.requirePerson(ctx, staffId);
        return this.view(ctx, person);
    }

    async update(
        ctx: OrganizationContext,
        staffId: string,
        dto: UpdatePersonRulesDto,
    ): Promise<PersonRulesSaved> {
        requireBookingPower(
            ctx,
            "hours:write",
            "Your role can't change booking rules.",
        );
        const person = await this.requirePerson(ctx, staffId);
        const business = await loadBookingRules(prisma, ctx.organizationId);
        const route = ruleChangeRoute({
            setsUp: allows(ctx, "service:write"),
            own: isOwn(ctx, person),
            needsApproval: business.memberRuleChangesNeedApproval,
        });
        if (route === "refuse") throw new ForbiddenException(OTHERS_REFUSAL);

        if (route === "apply") {
            // Read and written under the person's row lock, and only the
            // fields this save changes: two people saving different rules
            // of one person at once both keep theirs.
            const previous = await prisma.$transaction((tx) =>
                this.applyInTx(tx, ctx, person.id, dto, "direct"),
            );
            return {
                applied: true,
                previous,
                rules: await this.view(
                    ctx,
                    await this.requirePerson(ctx, staffId),
                ),
            };
        }
        const before = personRulesOf(person);
        const changes = changedRules(before, dto);
        if (!hasChanges(changes)) {
            return {
                applied: false,
                previous: {},
                rules: await this.view(ctx, person),
            };
        }
        await this.askInTx(ctx, person, changes);
        return {
            applied: false,
            previous: valuesOf(before, changes),
            rules: await this.view(ctx, await this.requirePerson(ctx, staffId)),
        };
    }

    /**
     * The requests waiting: every one for whoever decides them, else the
     * caller's own.
     */
    async waiting(ctx: OrganizationContext): Promise<RuleRequestView[]> {
        requireBookingPower(ctx, "service:read");
        const decides = allows(ctx, "service:write");
        const rows = await prisma.staffRuleRequest.findMany({
            where: {
                organizationId: ctx.organizationId,
                status: "WAITING",
                ...(decides
                    ? {}
                    : { staff: { membership: { userId: ctx.userId } } }),
            },
            include: { staff: { select: { name: true } } },
            orderBy: { createdAt: "asc" },
        });
        return requestViews(rows);
    }

    async approve(
        ctx: OrganizationContext,
        requestId: string,
    ): Promise<RuleRequestView> {
        requireBookingPower(ctx, "service:write", DECIDES_REFUSAL);
        return this.move(ctx, requestId, "approve");
    }

    async turnDown(
        ctx: OrganizationContext,
        requestId: string,
        reason?: string,
    ): Promise<RuleRequestView> {
        requireBookingPower(ctx, "service:write", DECIDES_REFUSAL);
        const words = reason?.trim() ?? "";
        return this.move(ctx, requestId, "turn-down", words || null);
    }

    /** The person who asked takes it back. */
    async withdraw(
        ctx: OrganizationContext,
        requestId: string,
    ): Promise<RuleRequestView> {
        return this.move(ctx, requestId, "withdraw");
    }

    /** The person says OK to an outcome; their rules stop showing it. */
    async dismiss(
        ctx: OrganizationContext,
        requestId: string,
    ): Promise<RuleRequestView> {
        const row = await this.requireRequest(ctx, requestId);
        if (!(await this.isRequester(ctx, row))) {
            throw new ForbiddenException(
                "Only the person who asked can clear this.",
            );
        }
        if (row.status === "WAITING") {
            throw new ConflictException(
                "This request is still waiting. Withdraw it instead.",
            );
        }
        const updated = await prisma.staffRuleRequest.update({
            where: { id: row.id },
            data: { dismissedAt: row.dismissedAt ?? new Date() },
            include: { staff: { select: { name: true } } },
        });
        return (await requestViews([updated]))[0];
    }

    // ── Internals ──────────────────────────────────────────────────────────

    /** Approve, turn down or withdraw a waiting request, once. */
    private async move(
        ctx: OrganizationContext,
        requestId: string,
        move: Exclude<RuleRequestMove, "replace">,
        reason: string | null = null,
    ): Promise<RuleRequestView> {
        const found = await this.requireRequest(ctx, requestId);
        if (move === "withdraw" && !(await this.isRequester(ctx, found))) {
            throw new ForbiddenException(
                "Only the person who asked can withdraw this request.",
            );
        }
        const updated = await prisma.$transaction(async (tx) => {
            // Under its lock, so an approve and a withdraw racing can't
            // both win.
            await tx.$queryRaw`SELECT id FROM "StaffRuleRequest" WHERE id = ${found.id} FOR UPDATE`;
            const row = await tx.staffRuleRequest.findUniqueOrThrow({
                where: { id: found.id },
            });
            const next = nextRequestStatus(row.status, move);
            if (!next) {
                throw new ConflictException(
                    `This request was already ${outcomeWords(requestStatusOf(row.status))}.`,
                );
            }
            const person = await tx.staffMember.findFirstOrThrow({
                where: { id: row.staffId, organizationId: ctx.organizationId },
                select: PERSON_SELECT,
            });
            if (next === "APPROVED") {
                await this.applyInTx(
                    tx,
                    ctx,
                    person.id,
                    storedRuleChanges(row.changes),
                    "approved",
                    row.id,
                );
            }
            const done = await tx.staffRuleRequest.update({
                where: { id: row.id },
                data: {
                    status: next,
                    decidedAt: new Date(),
                    decidedByUserId: ctx.userId,
                    ...(next === "TURNED_DOWN" ? { reason } : {}),
                },
                include: { staff: { select: { name: true } } },
            });
            if (next === "APPROVED" || next === "TURNED_DOWN") {
                await this.answerInTx(tx, ctx, row, next, reason);
            }
            await recordPersonRulesInTx(
                tx,
                ctx,
                person,
                next === "APPROVED"
                    ? {
                          action: AuditAction.StaffRulesApproved,
                          requestId: row.id,
                      }
                    : next === "TURNED_DOWN"
                      ? {
                            action: AuditAction.StaffRulesTurnedDown,
                            requestId: row.id,
                            reason,
                        }
                      : {
                            action: AuditAction.StaffRulesWithdrawn,
                            requestId: row.id,
                        },
            );
            return done;
        });
        return (await requestViews([updated]))[0];
    }

    /**
     * Write `changes` over a person's own rules, with its history: the row
     * is locked and read again first, and only the fields that differ from
     * it are written. Answers those fields' values before — what Undo sends
     * back, so it reverts this change alone.
     */
    private async applyInTx(
        tx: Prisma.TransactionClient,
        ctx: OrganizationContext,
        staffId: string,
        asked: RuleChanges,
        via: "direct" | "approved",
        requestId?: string,
    ): Promise<RuleChanges> {
        await tx.$queryRaw`SELECT id FROM "StaffMember" WHERE id = ${staffId} FOR UPDATE`;
        const person = await tx.staffMember.findFirstOrThrow({
            where: { id: staffId, organizationId: ctx.organizationId },
            select: PERSON_SELECT,
        });
        const before = personRulesOf(person);
        const changes = changedRules(before, asked);
        if (!hasChanges(changes)) return {};
        await tx.staffMember.update({
            where: { id: person.id },
            data: changes,
            select: { id: true },
        });
        await recordPersonRulesInTx(tx, ctx, person, {
            action: AuditAction.StaffRulesUpdate,
            via,
            changes: personRuleChanges(
                before,
                applyRuleChanges(before, changes),
            ),
            ...(requestId ? { requestId } : {}),
        });
        return valuesOf(before, changes);
    }

    /**
     * Ask for `changes`: replaces the person's waiting request, tells owners
     * and admins, and writes both into the history.
     */
    private async askInTx(
        ctx: OrganizationContext,
        person: PersonRow,
        changes: RuleChanges,
    ): Promise<void> {
        try {
            await prisma.$transaction(async (tx) => {
                // Under the waiting row's lock, as an approve or a turn-down
                // takes it: one decided first is no longer waiting here, so
                // it is never overwritten as withdrawn.
                const locked = await tx.$queryRaw<{ id: string }[]>`
                    SELECT id FROM "StaffRuleRequest"
                    WHERE "staffId" = ${person.id} AND status = 'WAITING'
                    FOR UPDATE`;
                const waiting = locked.length > 0 ? locked[0] : null;
                const replaced = waiting
                    ? await tx.staffRuleRequest.updateMany({
                          where: { id: waiting.id, status: "WAITING" },
                          data: {
                              status: "WITHDRAWN",
                              decidedAt: new Date(),
                              decidedByUserId: ctx.userId,
                          },
                      })
                    : { count: 0 };
                if (waiting && replaced.count === 1) {
                    await recordPersonRulesInTx(tx, ctx, person, {
                        action: AuditAction.StaffRulesWithdrawn,
                        requestId: waiting.id,
                        replaced: true,
                    });
                }
                const created = await tx.staffRuleRequest.create({
                    data: {
                        organizationId: ctx.organizationId,
                        staffId: person.id,
                        requestedByUserId: ctx.userId,
                        changes: changes,
                    },
                    select: { id: true },
                });
                const notice = await tx.notification.create({
                    data: {
                        organizationId: ctx.organizationId,
                        ...noticeOf(RULE_REQUEST_NOTIFICATION_TYPE, {
                            staffId: person.id,
                        }),
                        title: `${person.name} asked to change their booking rules`,
                        body: changesWords(changes).join(" · "),
                    },
                    select: { id: true },
                });
                await enqueueTeamAlert(tx, ctx.organizationId, {
                    event: "ask",
                    about: "rules",
                    requestId: created.id,
                    step: "asked",
                    notificationId: notice.id,
                });
                await recordPersonRulesInTx(tx, ctx, person, {
                    action: AuditAction.StaffRulesRequested,
                    requestId: created.id,
                    asked: changes,
                });
            });
        } catch (err) {
            // Two asks at once: one waiting request per person.
            if (prismaErrorCode(err) === "P2002") {
                throw new ConflictException(
                    "Another change to these rules was just sent. Look again.",
                );
            }
            throw err;
        }
    }

    /**
     * Tell the person who asked how it went: a notice in their own alerts
     * (`userId`, nobody else's inbox) and an email, queued with it.
     */
    private async answerInTx(
        tx: Prisma.TransactionClient,
        ctx: OrganizationContext,
        row: {
            id: string;
            staffId: string;
            requestedByUserId: string;
            changes: unknown;
        },
        outcome: "APPROVED" | "TURNED_DOWN",
        reason: string | null,
    ): Promise<void> {
        const asked = changesWords(storedRuleChanges(row.changes)).join(" · ");
        const notice = await tx.notification.create({
            data: {
                organizationId: ctx.organizationId,
                userId: row.requestedByUserId,
                ...noticeOf(RULE_ANSWER_NOTIFICATION_TYPE, {
                    staffId: row.staffId,
                }),
                title: answerTitle(outcome),
                body:
                    outcome === "APPROVED"
                        ? asked
                        : cleanReason(reason)
                          ? `${asked}. Reason: ${cleanReason(reason)}`
                          : `${asked}. No reason was given.`,
            },
            select: { id: true },
        });
        await enqueueTeamAlert(tx, ctx.organizationId, {
            event: "ask",
            about: "rules",
            requestId: row.id,
            step: "answered",
            notificationId: notice.id,
        });
    }

    private async view(
        ctx: OrganizationContext,
        person: PersonRow,
    ): Promise<PersonRulesView> {
        const [business, request] = await Promise.all([
            loadBookingRules(prisma, ctx.organizationId),
            prisma.staffRuleRequest.findFirst({
                where: {
                    staffId: person.id,
                    OR: [
                        { status: "WAITING" },
                        {
                            status: { in: ["APPROVED", "TURNED_DOWN"] },
                            dismissedAt: null,
                        },
                    ],
                },
                include: { staff: { select: { name: true } } },
                orderBy: { createdAt: "desc" },
            }),
        ]);
        const own = personRulesOf(person);
        const route = ruleChangeRoute({
            setsUp: allows(ctx, "service:write"),
            own: isOwn(ctx, person),
            needsApproval: business.memberRuleChangesNeedApproval,
        });
        return {
            staffId: person.id,
            name: person.name,
            own,
            business: timing(business),
            effective: timing(rulesForPerson(business, own)),
            canChange: allows(ctx, "hours:write") && route !== "refuse",
            needsApproval: allows(ctx, "hours:write") && route === "request",
            // A request, and an owner's reason for turning it down, are for
            // the person it is about and whoever decides them.
            request:
                request && (isOwn(ctx, person) || allows(ctx, "service:write"))
                    ? (await requestViews([request]))[0]
                    : null,
        };
    }

    private async requirePerson(
        ctx: OrganizationContext,
        staffId: string,
    ): Promise<PersonRow> {
        const person = await prisma.staffMember.findFirst({
            where: { id: staffId, organizationId: ctx.organizationId },
            select: PERSON_SELECT,
        });
        if (!person) throw new NotFoundException("Staff member not found");
        return person;
    }

    private async requireRequest(ctx: OrganizationContext, requestId: string) {
        const row = await prisma.staffRuleRequest.findFirst({
            where: { id: requestId, organizationId: ctx.organizationId },
        });
        if (!row) throw new NotFoundException("Request not found");
        return row;
    }

    /** Whether the caller asked it, or it is about their own diary. */
    private async isRequester(
        ctx: OrganizationContext,
        row: { requestedByUserId: string; staffId: string },
    ): Promise<boolean> {
        if (row.requestedByUserId === ctx.userId) return true;
        const person = await prisma.staffMember.findFirst({
            where: { id: row.staffId, organizationId: ctx.organizationId },
            select: { membership: { select: { userId: true } } },
        });
        return person?.membership?.userId === ctx.userId;
    }
}

/** Whether the person on the diary is the caller. */
function isOwn(ctx: OrganizationContext, person: PersonRow): boolean {
    return person.membership?.userId === ctx.userId;
}

/** `before`'s values of the fields `changes` names. */
function valuesOf(before: PersonRules, changes: RuleChanges): RuleChanges {
    const out: RuleChanges = {};
    for (const field of Object.keys(changes) as (keyof PersonRules)[]) {
        out[field] = before[field];
    }
    return out;
}
