import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Activity, Lead, Stage } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import { PipelinesService } from "../pipelines/pipelines.service";
import type {
    CreateActivityDto,
    CreateLeadDto,
    CreateTaskDto,
    MoveLeadDto,
    UpdateLeadDto,
} from "./dto";

/** Optional filters for the lead list. */
export interface LeadListFilter {
    pipelineId?: string;
    stageId?: string;
}

/**
 * Org-owned CRM Leads — read, hand-create, edit, and stage movement (S3-005).
 *
 * Every operation is tenant-scoped by `ctx.organizationId` (proven by
 * `OrganizationGuard`, never client-supplied) and gated by the central policy:
 * reads require `lead:read`, writes require `lead:write` (both OWNER/ADMIN-only
 * — leads are sales data). Cross-tenant or missing ids surface as a 404 (never a
 * 403), mirroring `DomainsService.requireOwned`.
 *
 * Moving a lead is the acceptance-critical write: the target Stage must belong
 * to the SAME org AND the lead's OWN pipeline, and the move updates `stageId`
 * AND appends a `STAGE_CHANGED` Activity ATOMICALLY (a single `$transaction`) —
 * so the lead's timeline can never disagree with its current stage.
 */
@Injectable()
export class LeadsService {
    constructor(private readonly pipelines: PipelinesService) {}

    /**
     * The org's leads, newest first, each with its contact + current stage.
     * Authorizes `lead:read`. Optional `pipelineId` / `stageId` narrow the list
     * (used by the board to load one pipeline's leads).
     */
    async list(
        ctx: OrganizationContext,
        filter: LeadListFilter = {},
    ): Promise<Lead[]> {
        authorize(ctx, "lead:read");
        return prisma.lead.findMany({
            where: {
                organizationId: ctx.organizationId,
                ...(filter.pipelineId ? { pipelineId: filter.pipelineId } : {}),
                ...(filter.stageId ? { stageId: filter.stageId } : {}),
            },
            orderBy: { createdAt: "desc" },
            include: { contact: true, stage: true },
        });
    }

    /**
     * A lead with its contact, pipeline (+ ordered stages, so the UI can offer a
     * move target), current stage, and full activity timeline (oldest first).
     * Authorizes `lead:read`; a missing / cross-tenant id 404s.
     */
    async get(ctx: OrganizationContext, leadId: string) {
        authorize(ctx, "lead:read");

        const lead = await prisma.lead.findUnique({
            where: { id: leadId },
            include: {
                contact: true,
                stage: true,
                pipeline: {
                    include: { stages: { orderBy: { order: "asc" } } },
                },
                activities: { orderBy: { createdAt: "asc" } },
            },
        });
        if (lead?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Lead not found");
        }
        return lead;
    }

    /**
     * Hand-create a lead. Authorizes `lead:write`. Resolves the Contact
     * (`contactId` must be an owned contact, else the inline `contact` is
     * upserted by email), the Pipeline (`pipelineId` owned, else the org
     * default), and the entry Stage (`stageId` must be in that pipeline, else its
     * first stage). Creates the Lead + a `CREATED` Activity atomically.
     */
    async create(ctx: OrganizationContext, dto: CreateLeadDto): Promise<Lead> {
        authorize(ctx, "lead:write");

        const contactId = await this.resolveContactId(ctx, dto);

        // Resolve the pipeline (owned or the org default) with its stages.
        const pipeline = dto.pipelineId
            ? await this.requireOwnedPipeline(ctx, dto.pipelineId)
            : await this.pipelines.ensureDefault(ctx.organizationId);

        // Resolve the entry stage: an explicit stage must belong to this
        // pipeline; otherwise use the pipeline's lowest-order stage.
        let stage: Stage | undefined;
        if (dto.stageId) {
            stage = pipeline.stages.find((s) => s.id === dto.stageId);
            if (!stage) {
                throw new BadRequestException(
                    "Stage does not belong to the pipeline",
                );
            }
        } else {
            stage = pipeline.stages[0];
        }
        if (!stage) {
            throw new BadRequestException(
                "The target pipeline has no stages configured",
            );
        }

        return prisma.$transaction(async (tx) => {
            const lead = await tx.lead.create({
                data: {
                    organizationId: ctx.organizationId,
                    contactId,
                    pipelineId: pipeline.id,
                    stageId: stage.id,
                    title: dto.title,
                    status: "OPEN",
                    value: dto.value ?? null,
                },
            });

            await tx.activity.create({
                data: {
                    organizationId: ctx.organizationId,
                    leadId: lead.id,
                    type: "CREATED",
                    body: "Lead created manually",
                    actorUserId: ctx.userId,
                },
            });

            return lead;
        });
    }

    /**
     * Patch a lead's title / status / value (never its stage — that is `move`).
     * Authorizes `lead:write`; a missing / cross-tenant id 404s.
     */
    async update(
        ctx: OrganizationContext,
        leadId: string,
        dto: UpdateLeadDto,
    ): Promise<Lead> {
        authorize(ctx, "lead:write");

        await this.requireOwned(ctx, leadId);

        return prisma.lead.update({
            where: { id: leadId },
            data: {
                ...(dto.title !== undefined ? { title: dto.title } : {}),
                ...(dto.status !== undefined ? { status: dto.status } : {}),
                ...(dto.value !== undefined ? { value: dto.value } : {}),
            },
        });
    }

    /**
     * Move a lead to another Stage of its OWN pipeline. Authorizes `lead:write`.
     * Validates the target stage belongs to the same org AND the lead's pipeline
     * (else 400 — never silently accept a foreign stage). Updates `stageId` and
     * appends a `STAGE_CHANGED` Activity (naming who moved it, from → to) in a
     * SINGLE `$transaction`, so the timeline and the current stage can never
     * drift apart. A no-op move (same stage) is rejected as a 400.
     */
    async move(
        ctx: OrganizationContext,
        leadId: string,
        dto: MoveLeadDto,
    ): Promise<Lead> {
        authorize(ctx, "lead:write");

        const lead = await this.requireOwned(ctx, leadId);

        if (dto.stageId === lead.stageId) {
            throw new BadRequestException("Lead is already at that stage");
        }

        const from = await prisma.stage.findUnique({
            where: { id: lead.stageId },
        });
        const to = await prisma.stage.findUnique({
            where: { id: dto.stageId },
        });

        // The destination must be a real stage of THIS lead's pipeline in THIS
        // org — reject a foreign/cross-pipeline stage rather than move blindly.
        if (
            to?.organizationId !== ctx.organizationId ||
            to.pipelineId !== lead.pipelineId
        ) {
            throw new BadRequestException(
                "Target stage is not in the lead's pipeline",
            );
        }

        const body = `Stage changed${from ? ` from "${from.name}"` : ""} to "${to.name}"`;

        return prisma.$transaction(async (tx) => {
            const moved = await tx.lead.update({
                where: { id: lead.id },
                data: { stageId: to.id },
            });

            await tx.activity.create({
                data: {
                    organizationId: ctx.organizationId,
                    leadId: lead.id,
                    type: "STAGE_CHANGED",
                    body,
                    actorUserId: ctx.userId,
                },
            });

            return moved;
        });
    }

    /**
     * The lead's activity timeline, newest first — a dedicated fetch for the
     * timeline component (the lead detail already embeds activities oldest
     * first). Authorizes `activity:read`; a missing / cross-tenant lead 404s.
     */
    async listActivities(
        ctx: OrganizationContext,
        leadId: string,
    ): Promise<Activity[]> {
        authorize(ctx, "activity:read");

        await this.requireOwned(ctx, leadId);

        return prisma.activity.findMany({
            where: { leadId, organizationId: ctx.organizationId },
            orderBy: { createdAt: "desc" },
        });
    }

    /**
     * Log an activity (a NOTE by default) on a lead's timeline. Authorizes
     * `activity:write`; a missing / cross-tenant lead 404s. The Activity records
     * `actorUserId` so the timeline names who wrote it — matching `move`.
     */
    async logActivity(
        ctx: OrganizationContext,
        leadId: string,
        dto: CreateActivityDto,
    ): Promise<Activity> {
        authorize(ctx, "activity:write");

        await this.requireOwned(ctx, leadId);

        return prisma.activity.create({
            data: {
                organizationId: ctx.organizationId,
                leadId,
                type: dto.type ?? "NOTE",
                body: dto.body,
                actorUserId: ctx.userId,
            },
        });
    }

    /**
     * Create a follow-up TASK on a lead: `type:"TASK"` with `body` + `dueAt`,
     * `actorUserId` set to the creator, `completedAt` null until done.
     * Authorizes `activity:write`; a missing / cross-tenant lead 404s.
     */
    async createTask(
        ctx: OrganizationContext,
        leadId: string,
        dto: CreateTaskDto,
    ): Promise<Activity> {
        authorize(ctx, "activity:write");

        await this.requireOwned(ctx, leadId);

        return prisma.activity.create({
            data: {
                organizationId: ctx.organizationId,
                leadId,
                type: "TASK",
                body: dto.body,
                dueAt: new Date(dto.dueAt),
                actorUserId: ctx.userId,
            },
        });
    }

    /**
     * Mark a follow-up TASK done by stamping `completedAt = now`. Authorizes
     * `activity:write`. Idempotent — re-completing keeps the original
     * `completedAt`. The activity must be a `TASK` of THIS lead in THIS org,
     * else 404 (a note, a foreign task, or a cross-tenant lead never completes).
     */
    async completeTask(
        ctx: OrganizationContext,
        leadId: string,
        activityId: string,
    ): Promise<Activity> {
        authorize(ctx, "activity:write");

        await this.requireOwned(ctx, leadId);

        const activity = await prisma.activity.findUnique({
            where: { id: activityId },
        });
        if (
            activity?.organizationId !== ctx.organizationId ||
            activity.leadId !== leadId ||
            activity.type !== "TASK"
        ) {
            throw new NotFoundException("Task not found");
        }

        // Idempotent: once completed, keep the original completion time.
        if (activity.completedAt) {
            return activity;
        }

        return prisma.activity.update({
            where: { id: activity.id },
            data: { completedAt: new Date() },
        });
    }

    /**
     * Open (incomplete) follow-up TASKs across the org — a follow-up worklist,
     * soonest due first (nulls last), then newest. Authorizes `activity:read`.
     */
    async listOpenTasks(ctx: OrganizationContext): Promise<Activity[]> {
        authorize(ctx, "activity:read");

        return prisma.activity.findMany({
            where: {
                organizationId: ctx.organizationId,
                type: "TASK",
                completedAt: null,
            },
            orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
        });
    }

    /**
     * Resolve the Contact for a new lead: an explicit `contactId` must be an
     * owned contact (404 otherwise); an inline `contact` is upserted by
     * `(organizationId, email)` so a manual lead reuses a known person. Throws
     * 400 when neither is supplied.
     */
    private async resolveContactId(
        ctx: OrganizationContext,
        dto: CreateLeadDto,
    ): Promise<string> {
        if (dto.contactId) {
            const contact = await prisma.contact.findUnique({
                where: { id: dto.contactId },
            });
            if (contact?.organizationId !== ctx.organizationId) {
                throw new NotFoundException("Contact not found");
            }
            return contact.id;
        }

        if (dto.contact) {
            const c = dto.contact;
            const contact = await prisma.contact.upsert({
                where: {
                    organizationId_email: {
                        organizationId: ctx.organizationId,
                        email: c.email,
                    },
                },
                update: {
                    ...(c.firstName !== undefined
                        ? { firstName: c.firstName }
                        : {}),
                    ...(c.lastName !== undefined
                        ? { lastName: c.lastName }
                        : {}),
                    ...(c.phone !== undefined ? { phone: c.phone } : {}),
                    ...(c.company !== undefined ? { company: c.company } : {}),
                },
                create: {
                    organizationId: ctx.organizationId,
                    email: c.email,
                    firstName: c.firstName ?? null,
                    lastName: c.lastName ?? null,
                    phone: c.phone ?? null,
                    company: c.company ?? null,
                    source: "manual",
                },
            });
            return contact.id;
        }

        throw new BadRequestException(
            "A lead needs either a contactId or an inline contact",
        );
    }

    /**
     * Load a lead and assert it belongs to `ctx.organizationId`. 404 for a
     * missing OR cross-tenant id (never a 403 — no cross-org probing).
     */
    private async requireOwned(
        ctx: OrganizationContext,
        leadId: string,
    ): Promise<Lead> {
        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (lead?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Lead not found");
        }
        return lead;
    }

    /**
     * Load a pipeline (with ordered stages) and assert org ownership. 404 for a
     * missing or cross-tenant id.
     */
    private async requireOwnedPipeline(
        ctx: OrganizationContext,
        pipelineId: string,
    ) {
        const pipeline = await prisma.pipeline.findUnique({
            where: { id: pipelineId },
            include: { stages: { orderBy: { order: "asc" } } },
        });
        if (pipeline?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Pipeline not found");
        }
        return pipeline;
    }
}
