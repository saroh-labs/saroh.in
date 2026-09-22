import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Form } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import type { CreateFormDto, FormFieldDto, UpdateFormDto } from "./dto";

/** A form, with how much has come through it. */
export type FormWithActivity = Form & {
    submissionCount: number;
    /** ISO time of the latest submission; `null` before the first. */
    lastSubmissionAt: string | null;
};

/** One entry someone sent through a form, as the workspace lists it. */
export interface SubmissionItem {
    id: string;
    createdAt: string;
    /** The raw values, keyed by the form's field names. */
    data: Record<string, unknown>;
    /** The contact it became, unless that contact was since deleted. */
    contact: { id: string; name: string; email: string } | null;
    /** The lead it opened, unless that lead was since deleted. */
    leadId: string | null;
}

/** How many entries one read returns; the page says when there are more. */
export const SUBMISSIONS_PAGE = 200;

/**
 * Org-owned enquiry Form management (S3-002).
 *
 * Every operation is tenant-scoped by `ctx.organizationId` (taken from the
 * resolved {@link OrganizationContext}, proven by `OrganizationGuard`, never a
 * client-supplied value) and gated by the central policy: reads require
 * `form:read`, writes require `form:write` (both OWNER/ADMIN-only). A form's
 * `fields` array must be well-formed — unique field names and at least one
 * `email` field, since the submitted email is the Contact dedupe key for the
 * public enquiry command. Cross-tenant or missing ids surface as a 404 (never a
 * 403) so a caller can't probe which forms exist in another org, mirroring
 * `DomainsService.requireOwned`.
 */
@Injectable()
export class FormsService {
    /**
     * Create a Form for the org. Authorizes `form:write`, validates the field
     * descriptors (unique names + an email field), and optionally binds a Site
     * and/or a Pipeline — each of which must belong to the org (else 404). The
     * new form is ACTIVE and immediately accepts public submissions.
     */
    async create(ctx: OrganizationContext, dto: CreateFormDto): Promise<Form> {
        authorize(ctx, "form:write");

        this.assertFieldsWellFormed(dto.fields);

        if (dto.siteId) {
            await this.requireOwnedSite(ctx, dto.siteId);
        }
        if (dto.pipelineId) {
            await this.requireOwnedPipeline(ctx, dto.pipelineId);
        }

        return prisma.form.create({
            data: {
                organizationId: ctx.organizationId,
                name: dto.name,
                fields: dto.fields as unknown as Prisma.InputJsonValue,
                siteId: dto.siteId ?? null,
                pipelineId: dto.pipelineId ?? null,
                status: "ACTIVE",
            },
        });
    }

    /**
     * List the org's forms, newest first, each with how many entries it has
     * had and when the latest came (#385). Authorizes `form:read`. Excludes
     * soft-deleted. One grouped read for the counts, not one per form.
     */
    async list(ctx: OrganizationContext): Promise<FormWithActivity[]> {
        authorize(ctx, "form:read");
        const [forms, activity] = await Promise.all([
            prisma.form.findMany({
                where: { organizationId: ctx.organizationId, deletedAt: null },
                orderBy: { createdAt: "desc" },
            }),
            prisma.submission.groupBy({
                by: ["formId"],
                where: { organizationId: ctx.organizationId },
                _count: { _all: true },
                _max: { createdAt: true },
            }),
        ]);
        const byForm = new Map(activity.map((a) => [a.formId, a]));
        return forms.map((form) => {
            const a = byForm.get(form.id);
            return {
                ...form,
                submissionCount: a?._count._all ?? 0,
                lastSubmissionAt: a?._max.createdAt?.toISOString() ?? null,
            };
        });
    }

    /**
     * What people have sent through one form, newest first (#385).
     * Authorizes `form:read`; another business's form 404s.
     *
     * The raw entry is the record: it outlives the contact and lead it
     * created (SetNull), so a deleted contact shows as `null` here while what
     * they typed stays. Returns the latest {@link SUBMISSIONS_PAGE}, and the
     * total, so the screen can say when it is showing only some.
     */
    async listSubmissions(
        ctx: OrganizationContext,
        formId: string,
    ): Promise<{ total: number; items: SubmissionItem[] }> {
        authorize(ctx, "form:read");
        await this.requireOwned(ctx, formId);
        const where = { formId, organizationId: ctx.organizationId };
        const [total, rows] = await Promise.all([
            prisma.submission.count({ where }),
            prisma.submission.findMany({
                where,
                orderBy: { createdAt: "desc" },
                take: SUBMISSIONS_PAGE,
                select: {
                    id: true,
                    createdAt: true,
                    data: true,
                    leadId: true,
                    contact: {
                        select: {
                            id: true,
                            email: true,
                            firstName: true,
                            lastName: true,
                        },
                    },
                },
            }),
        ]);
        return {
            total,
            items: rows.map((r) => ({
                id: r.id,
                createdAt: r.createdAt.toISOString(),
                data:
                    r.data &&
                    typeof r.data === "object" &&
                    !Array.isArray(r.data)
                        ? (r.data as Record<string, unknown>)
                        : {},
                leadId: r.leadId,
                contact: r.contact
                    ? {
                          id: r.contact.id,
                          email: r.contact.email,
                          name:
                              [r.contact.firstName, r.contact.lastName]
                                  .filter(Boolean)
                                  .join(" ")
                                  .trim() || r.contact.email,
                      }
                    : null,
            })),
        };
    }

    /** Get one owned form. Authorizes `form:read`; cross-tenant/missing → 404. */
    async get(ctx: OrganizationContext, formId: string): Promise<Form> {
        authorize(ctx, "form:read");
        return this.requireOwned(ctx, formId);
    }

    /**
     * Update a Form's name/fields/status/pipeline. Authorizes `form:write`,
     * loads the org's own form (404 otherwise). Re-validates `fields` when
     * present, and re-checks a new `pipelineId` belongs to the org (404).
     */
    async update(
        ctx: OrganizationContext,
        formId: string,
        dto: UpdateFormDto,
    ): Promise<Form> {
        authorize(ctx, "form:write");

        const form = await this.requireOwned(ctx, formId);

        if (dto.fields) {
            this.assertFieldsWellFormed(dto.fields);
        }
        if (dto.pipelineId) {
            await this.requireOwnedPipeline(ctx, dto.pipelineId);
        }

        const data: Prisma.FormUpdateInput = {};
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.fields !== undefined) {
            data.fields = dto.fields as unknown as Prisma.InputJsonValue;
        }
        if (dto.status !== undefined) data.status = dto.status;
        if (dto.pipelineId !== undefined) {
            data.pipeline = { connect: { id: dto.pipelineId } };
        }

        return prisma.form.update({ where: { id: form.id }, data });
    }

    /**
     * Soft-delete a Form: set `deletedAt` and status ARCHIVED so it stops
     * accepting submissions, while its historical submissions/leads survive.
     * Authorizes `form:write`; cross-tenant/missing → 404.
     */
    async remove(
        ctx: OrganizationContext,
        formId: string,
    ): Promise<{ id: string; deleted: true }> {
        authorize(ctx, "form:write");

        const form = await this.requireOwned(ctx, formId);

        await prisma.form.update({
            where: { id: form.id },
            data: { deletedAt: new Date(), status: "ARCHIVED" },
        });

        return { id: form.id, deleted: true };
    }

    /**
     * Assert the field descriptors are semantically valid: names are unique and
     * at least one field is of type `email` (the Contact dedupe key). 400 with a
     * clear message otherwise. Structural validation (types, non-empty) already
     * happened in the DTO via class-validator.
     */
    private assertFieldsWellFormed(fields: FormFieldDto[]): void {
        const names = fields.map((f) => f.name);
        const seen = new Set<string>();
        for (const name of names) {
            if (seen.has(name)) {
                throw new BadRequestException(
                    `Duplicate field name "${name}" — field names must be unique`,
                );
            }
            seen.add(name);
        }

        const hasEmail = fields.some((f) => f.type === "email");
        if (!hasEmail) {
            throw new BadRequestException(
                'A form must have at least one field of type "email"',
            );
        }
    }

    /**
     * Load a form and assert it belongs to `ctx.organizationId` and is not
     * soft-deleted. Throws `NotFoundException` for a missing, cross-tenant, or
     * deleted id — a 404 (not 403) so a caller can't probe another org's forms.
     */
    private async requireOwned(ctx: OrganizationContext, formId: string) {
        const form = await prisma.form.findUnique({ where: { id: formId } });
        if (
            form?.organizationId !== ctx.organizationId ||
            form.deletedAt !== null
        ) {
            throw new NotFoundException("Form not found");
        }
        return form;
    }

    /** Assert a Site belongs to the org before binding a form to it (404 otherwise). */
    private async requireOwnedSite(ctx: OrganizationContext, siteId: string) {
        const site = await prisma.site.findUnique({ where: { id: siteId } });
        if (site?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Site not found");
        }
        return site;
    }

    /** Assert a Pipeline belongs to the org before binding a form to it (404 otherwise). */
    private async requireOwnedPipeline(
        ctx: OrganizationContext,
        pipelineId: string,
    ) {
        const pipeline = await prisma.pipeline.findUnique({
            where: { id: pipelineId },
        });
        if (pipeline?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Pipeline not found");
        }
        return pipeline;
    }
}
