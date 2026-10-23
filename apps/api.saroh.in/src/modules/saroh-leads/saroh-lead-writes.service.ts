import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { prismaErrorCode } from "../../common/prisma-errors";
import {
    AdminAuditOutcome,
    AdminAuditService,
} from "../admin/admin-audit.service";
import { istDay } from "../admin/admin-billing";
import { AdminPermission } from "../admin/admin-permissions";
import { scopeForStaff } from "../admin/staff-scope";
import {
    assertAccountManager,
    assertEmailFree,
    assertWonBusiness,
    CONTACT_SELECT,
    maySeeAll,
    optionalDay,
    optionalEmail,
    ownerName,
    requiredName,
    visibleLead,
} from "./lead-access";
import type { ContactKind, LeadStage } from "./lead-rules";
import { LEAD_STAGES, longTextOrNull, textOrNull } from "./lead-rules";
import type { LeadCard, LeadContact } from "./lead-views";
import { contactView, LEAD_SELECT, leadCard } from "./lead-views";

type Tx = Prisma.TransactionClient;

export interface AddLeadInput {
    name: string;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
    kind?: string | null;
    notes?: string | null;
    followUpOn?: string | null;
}

export interface UpdateLeadInput {
    name?: string;
    email?: string | null;
    signUpEmail?: string | null;
    phone?: string | null;
    city?: string | null;
    notes?: string | null;
    followUpOn?: string | null;
}

export interface MoveStageInput {
    stage: LeadStage;
    /** Won: the business the lead became. */
    organizationId?: string;
    /** Lost: why. */
    lostReason?: string;
    reason?: string;
}

export interface LogContactInput {
    kind: ContactKind;
    summary: string;
    feedback?: string | null;
    minutes?: number | null;
    /** When it happened; now when left out. */
    happenedAt?: string | null;
    /** Sets the lead's next follow-up, when given. */
    followUpOn?: string | null;
}

/**
 * Saroh's own sales leads (DEC-169, admin console U20), written: adding one,
 * changing its details, moving it through the stages, giving an unowned one
 * to a manager, and logging a call. The reads are `SarohLeadsService`.
 *
 * Every write goes through `scopeForStaff`: an Account manager changes only
 * the leads they own (another's is a 403), and only Support or a Platform
 * owner gives unowned ones out. Each is on the admin ledger in its own
 * transaction, with no email in its metadata.
 */
@Injectable()
export class SarohLeadWritesService {
    constructor(private readonly audit: AdminAuditService) {}

    /**
     * Add a lead. An Account manager owns what they add (ADDED); Support or
     * a Platform owner adds it unowned, to give out. An email already on
     * another lead is refused, saying whose it is: the first to record an
     * email owns it.
     */
    async add(
        staff: PlatformAdminInfo,
        input: AddLeadInput,
    ): Promise<LeadCard> {
        const scope = scopeForStaff(staff, AdminPermission.SarohLeadsWrite);
        const name = requiredName(input.name);
        const email = optionalEmail(input.email);
        const now = new Date();
        return this.writing(async (tx) => {
            if (email) await assertEmailFree(tx, email.key, null);
            const own = scope.kind === "own" ? scope.platformAdminId : null;
            const row = await tx.sarohLead.create({
                data: {
                    name,
                    ...(email
                        ? {
                              email: email.email,
                              emailKey: email.key,
                              emailAt: now,
                          }
                        : {}),
                    phone: textOrNull(input.phone),
                    city: textOrNull(input.city),
                    kind: textOrNull(input.kind),
                    notes: longTextOrNull(input.notes),
                    followUpOn: optionalDay(input.followUpOn),
                    source: "ADDED",
                    stage: "NEW",
                    stagedAt: now,
                    ...(own
                        ? {
                              ownerPlatformAdminId: own,
                              ownerSince: now,
                              ownedHow: "ADDED",
                          }
                        : {}),
                },
                select: LEAD_SELECT,
            });
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.SarohLeadsWrite,
                action: "saroh-lead.added",
                targetType: "saroh_lead",
                targetId: row.id,
                outcome: AdminAuditOutcome.Success,
                metadata: { owned: Boolean(own), hasEmail: Boolean(email) },
            });
            return leadCard(row, istDay(now));
        });
    }

    /**
     * Change a lead's details. Putting an email on it (or a sign-up email)
     * records when, and is refused when another lead already has it.
     */
    async update(
        staff: PlatformAdminInfo,
        leadId: string,
        input: UpdateLeadInput,
    ): Promise<LeadCard> {
        const scope = scopeForStaff(staff, AdminPermission.SarohLeadsWrite);
        const now = new Date();
        return this.writing(async (tx) => {
            const lead = await visibleLead(tx, scope, leadId);
            const data: Prisma.SarohLeadUpdateInput = {};
            const changed: string[] = [];
            if (input.name !== undefined) {
                data.name = requiredName(input.name);
                changed.push("name");
            }
            if (input.email !== undefined) {
                const email = optionalEmail(input.email);
                if (email?.key !== lead.emailKey) {
                    if (email) await assertEmailFree(tx, email.key, lead.id);
                    Object.assign(
                        data,
                        email
                            ? {
                                  email: email.email,
                                  emailKey: email.key,
                                  emailAt: now,
                              }
                            : { email: null, emailKey: null, emailAt: null },
                    );
                    changed.push("email");
                }
            }
            if (input.signUpEmail !== undefined) {
                const email = optionalEmail(input.signUpEmail);
                if (email?.key !== lead.signUpEmailKey) {
                    if (email) await assertEmailFree(tx, email.key, lead.id);
                    Object.assign(
                        data,
                        email
                            ? {
                                  signUpEmail: email.email,
                                  signUpEmailKey: email.key,
                                  signUpEmailAt: now,
                              }
                            : {
                                  signUpEmail: null,
                                  signUpEmailKey: null,
                                  signUpEmailAt: null,
                              },
                    );
                    changed.push("signUpEmail");
                }
            }
            for (const field of ["phone", "city"] as const) {
                if (input[field] !== undefined) {
                    data[field] = textOrNull(input[field]);
                    changed.push(field);
                }
            }
            if (input.notes !== undefined) {
                data.notes = longTextOrNull(input.notes);
                changed.push("notes");
            }
            if (input.followUpOn !== undefined) {
                data.followUpOn = optionalDay(input.followUpOn);
                changed.push("followUpOn");
            }
            const row = await tx.sarohLead.update({
                where: { id: lead.id },
                data,
                select: LEAD_SELECT,
            });
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.SarohLeadsWrite,
                action: "saroh-lead.updated",
                targetType: "saroh_lead",
                targetId: lead.id,
                outcome: AdminAuditOutcome.Success,
                // Which fields changed, never their values.
                metadata: { changed },
            });
            return leadCard(row, istDay(now));
        });
    }

    /**
     * Move a lead to another stage. Won names the business it became (an
     * Account manager picks one of {@link wonCandidates}); Lost says why.
     * Moving it back to an open stage clears both.
     */
    async moveStage(
        staff: PlatformAdminInfo,
        leadId: string,
        input: MoveStageInput,
    ): Promise<LeadCard> {
        const scope = scopeForStaff(staff, AdminPermission.SarohLeadsWrite);
        if (!(LEAD_STAGES as readonly string[]).includes(input.stage)) {
            throw new BadRequestException("That isn't a stage.");
        }
        const now = new Date();
        return this.writing(async (tx) => {
            const lead = await visibleLead(tx, scope, leadId);
            let won: { organizationId: string } | null = null;
            let lostReason: string | null = null;
            if (input.stage === "WON") {
                const organizationId = input.organizationId?.trim();
                if (!organizationId) {
                    throw new BadRequestException(
                        "Won needs the business this lead became.",
                    );
                }
                await assertWonBusiness(tx, scope, lead, organizationId);
                won = { organizationId };
            }
            if (input.stage === "LOST") {
                lostReason = textOrNull(input.lostReason);
                if (!lostReason || lostReason.length < 3) {
                    throw new BadRequestException("Lost needs a reason.");
                }
            }
            const row = await tx.sarohLead.update({
                where: { id: lead.id },
                data: {
                    stage: input.stage,
                    stagedAt: now,
                    wonOrganizationId: won?.organizationId ?? null,
                    wonAt: won ? now : null,
                    lostReason,
                },
                select: LEAD_SELECT,
            });
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.SarohLeadsWrite,
                action: "saroh-lead.stage",
                targetType: "saroh_lead",
                targetId: lead.id,
                organizationId: won?.organizationId,
                reason: textOrNull(input.reason) ?? lostReason ?? undefined,
                outcome: AdminAuditOutcome.Success,
                metadata: { from: lead.stage, to: input.stage },
            });
            return leadCard(row, istDay(now));
        });
    }

    /**
     * Give an unowned lead to an Account manager (ASSIGNED). Only staff with
     * every lead in scope, never a manager for themselves: a lead someone
     * already owns stays theirs.
     */
    async assign(
        staff: PlatformAdminInfo,
        leadId: string,
        input: { platformAdminId: string; reason: string },
    ): Promise<LeadCard> {
        const scope = scopeForStaff(staff, AdminPermission.SarohLeadsWrite);
        if (scope.kind !== "all" || !maySeeAll(staff)) {
            throw new ForbiddenException(
                "Only Support or a Platform owner gives out leads.",
            );
        }
        const reason = textOrNull(input.reason);
        if (!reason || reason.length < 4) {
            throw new BadRequestException("Give a reason for this change.");
        }
        const now = new Date();
        return this.writing(async (tx) => {
            const lead = await visibleLead(tx, scope, leadId);
            if (lead.ownerPlatformAdminId) {
                throw new ConflictException(
                    `This lead is already ${ownerName(lead.owner)}'s.`,
                );
            }
            await assertAccountManager(tx, input.platformAdminId, now);
            // Only while still unowned: two assignments at once, one wins.
            const { count } = await tx.sarohLead.updateMany({
                where: { id: lead.id, ownerPlatformAdminId: null },
                data: {
                    ownerPlatformAdminId: input.platformAdminId,
                    ownerSince: now,
                    ownedHow: "ASSIGNED",
                },
            });
            if (count === 0) {
                throw new ConflictException(
                    "Someone gave this lead out a moment ago. Reload to see who.",
                );
            }
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.SarohLeadsWrite,
                action: "saroh-lead.assigned",
                targetType: "saroh_lead",
                targetId: lead.id,
                reason,
                outcome: AdminAuditOutcome.Success,
                metadata: { ownerPlatformAdminId: input.platformAdminId },
            });
            const row = await tx.sarohLead.findUniqueOrThrow({
                where: { id: lead.id },
                select: LEAD_SELECT,
            });
            return leadCard(row, istDay(now));
        });
    }

    /** Log a call, visit or message on a lead, and its next follow-up. */
    async logContact(
        staff: PlatformAdminInfo,
        leadId: string,
        input: LogContactInput,
    ): Promise<LeadContact> {
        const scope = scopeForStaff(staff, AdminPermission.SarohLeadsWrite);
        const summary = longTextOrNull(input.summary);
        if (!summary) throw new BadRequestException("Say what was said.");
        const now = new Date();
        const happenedAt = input.happenedAt ? new Date(input.happenedAt) : now;
        if (Number.isNaN(happenedAt.getTime()) || happenedAt > now) {
            throw new BadRequestException(
                "When it happened can't be later than now.",
            );
        }
        return this.writing(async (tx) => {
            const lead = await visibleLead(tx, scope, leadId);
            const row = await tx.sarohContactLog.create({
                data: {
                    leadId: lead.id,
                    platformAdminId: staff.platformAdminId,
                    actorUserId: staff.userId,
                    kind: input.kind,
                    happenedAt,
                    minutes: input.minutes ?? null,
                    summary,
                    feedback: longTextOrNull(input.feedback),
                },
                select: CONTACT_SELECT,
            });
            if (input.followUpOn !== undefined) {
                await tx.sarohLead.update({
                    where: { id: lead.id },
                    data: { followUpOn: optionalDay(input.followUpOn) },
                    select: { id: true },
                });
            }
            await this.audit.write(tx, {
                actorUserId: staff.userId,
                permission: AdminPermission.SarohLeadsWrite,
                action: "saroh-lead.contact-logged",
                targetType: "saroh_lead",
                targetId: lead.id,
                outcome: AdminAuditOutcome.Success,
                metadata: {
                    kind: input.kind,
                    contactLogId: row.id,
                    followUpSet: input.followUpOn !== undefined,
                },
            });
            return contactView(row);
        });
    }

    /**
     * One write's transaction. Serializable, so an email can't be recorded
     * on two leads by two writes at once; a clash on the unique email key is
     * told as the email being taken.
     */
    private async writing<T>(change: (tx: Tx) => Promise<T>): Promise<T> {
        try {
            return await prisma.$transaction(change, {
                isolationLevel: "Serializable",
            });
        } catch (error) {
            const code = prismaErrorCode(error);
            if (code === "P2002") {
                throw new ConflictException("That email is already a lead.");
            }
            if (code === "P2034") {
                throw new ConflictException(
                    "Someone changed this lead at the same moment. Try again.",
                );
            }
            throw error;
        }
    }
}
