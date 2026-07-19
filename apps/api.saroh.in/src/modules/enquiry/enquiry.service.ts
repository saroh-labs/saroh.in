import {
    BadRequestException,
    GoneException,
    HttpException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";

import type { FieldType, FormField } from "../forms/dto";
import { FixedWindowRateLimiter } from "./rate-limiter";

/** The result of a successful (or idempotently-replayed) submission. */
export interface EnquiryResult {
    submissionId: string;
    leadId: string;
    contactId: string;
}

/** Pragmatic email shape check — good enough as a submit-time guard. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The default pipeline's stage names, in board order (0..4). */
const DEFAULT_STAGES = [
    "New",
    "Contacted",
    "Qualified",
    "Won",
    "Lost",
] as const;

/**
 * PUBLIC enquiry submission command (S3-002) — the write behind
 * `POST /public/forms/:formId/submit`. This is the ONLY unauthenticated CRM
 * write, so it is the security boundary for the whole funnel.
 *
 * The isolation guarantee: the owning organization is derived from
 * `form.organizationId`, NEVER from any client-supplied value. A submitter
 * targets a Form by id and everything created (Contact, Lead, Submission, Job,
 * Activity) is stamped with that Form's org — so a public submitter can never
 * write into an organization other than the one that owns the form.
 *
 * "One submission produces one correct lead": submission is validated,
 * rate-limited, idempotent, and fully atomic — a single `$transaction` upserts
 * the Contact, creates the Lead + immutable Submission, and enqueues the
 * notification Job as a transactional outbox row, so a committed lead ALWAYS has
 * exactly one pending notification and a rolled-back one leaves nothing behind.
 */
@Injectable()
export class EnquiryService {
    /**
     * @param rateLimiter per-instance limiter (default 5 hits / minute per
     * `${formId}:${ipHash}`). Injectable for tests; see {@link FixedWindowRateLimiter}
     * for the distributed-limiter caveat.
     */
    constructor(
        private readonly rateLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(),
    ) {}

    /**
     * Submit an enquiry against a public Form. Steps (in order):
     *  1. Load the Form; 404 if missing/soft-deleted, 410 if not ACTIVE.
     *  2. Validate `data` against `form.fields` (required present, email valid) — 400 otherwise.
     *  3. Idempotency: an existing Submission for `(formId, idempotencyKey)` is replayed, no new lead.
     *  4. Rate-limit by `${formId}:${ipHash}`; 429 on exceed.
     *  5. In ONE transaction: upsert Contact, ensure Pipeline+Stage, create Lead,
     *     create immutable Submission, enqueue the `enquiry.notify` Job, log a CREATED Activity.
     *
     * @param formId          the target Form's id (the only client-chosen routing input)
     * @param data            raw field name → value map as submitted
     * @param idempotencyKey  optional client key to dedupe double-submits
     * @param ipHash          sha256 of the source IP (never the raw IP), for rate-limiting
     */
    async submit(
        formId: string,
        data: Record<string, unknown>,
        idempotencyKey: string | undefined,
        ipHash: string | undefined,
    ): Promise<EnquiryResult> {
        // 1. Load the Form. The org is taken from HERE, never from the client.
        const form = await prisma.form.findUnique({ where: { id: formId } });
        if (form?.deletedAt !== null) {
            throw new NotFoundException("Form not found");
        }
        if (form.status !== "ACTIVE") {
            throw new GoneException(
                "This form is no longer accepting submissions",
            );
        }

        const fields = this.readFields(form.fields);

        // 2. Validate the submitted data against the form definition.
        const contactFields = this.validate(fields, data);

        // 3. Idempotency pre-check — replay an existing submission unchanged.
        if (idempotencyKey) {
            const existing = await prisma.submission.findUnique({
                where: { formId_idempotencyKey: { formId, idempotencyKey } },
            });
            if (existing) {
                return this.resultOf(existing);
            }
        }

        // 4. Rate-limit per (form, hashed IP). Cheap per-instance abuse guard.
        if (ipHash) {
            const allowed = this.rateLimiter.take(`${formId}:${ipHash}`);
            if (!allowed) {
                throw new HttpException(
                    "Too many submissions — please slow down and try again shortly",
                    429,
                );
            }
        }

        // 5. Atomic creation.
        const organizationId = form.organizationId;
        try {
            return await prisma.$transaction(async (tx) => {
                const contact = await this.upsertContact(
                    tx,
                    organizationId,
                    formId,
                    contactFields,
                );

                const { pipeline, stage } = await this.resolvePipeline(
                    tx,
                    organizationId,
                    form.pipelineId,
                );

                const lead = await tx.lead.create({
                    data: {
                        organizationId,
                        contactId: contact.id,
                        pipelineId: pipeline.id,
                        stageId: stage.id,
                        formId,
                        title: this.leadTitle(contactFields, form.name),
                        status: "OPEN",
                    },
                });

                const submission = await tx.submission.create({
                    data: {
                        organizationId,
                        formId,
                        contactId: contact.id,
                        leadId: lead.id,
                        data: data as Prisma.InputJsonValue,
                        ipHash: ipHash ?? null,
                        idempotencyKey: idempotencyKey ?? null,
                    },
                });

                // Transactional outbox: a committed lead ALWAYS has a pending
                // notification. The worker/handler is a separate ticket
                // (S3-003/S3-006); here we only durably insert the row.
                await tx.job.create({
                    data: {
                        organizationId,
                        type: "enquiry.notify",
                        payload: {
                            leadId: lead.id,
                            contactId: contact.id,
                            formId,
                            submissionId: submission.id,
                        },
                    },
                });

                await tx.activity.create({
                    data: {
                        organizationId,
                        leadId: lead.id,
                        type: "CREATED",
                        body: "Lead created from enquiry",
                    },
                });

                return {
                    submissionId: submission.id,
                    leadId: lead.id,
                    contactId: contact.id,
                };
            });
        } catch (err) {
            // Race backstop: two concurrent submits with the same
            // (formId, idempotencyKey) — the DB unique index rejects the second
            // (P2002). Re-read and replay the winner instead of erroring.
            if (idempotencyKey && (err as { code?: string }).code === "P2002") {
                const existing = await prisma.submission.findUnique({
                    where: {
                        formId_idempotencyKey: { formId, idempotencyKey },
                    },
                });
                if (existing) {
                    return this.resultOf(existing);
                }
            }
            throw err;
        }
    }

    /** Narrow the persisted `Form.fields` JSON to a typed descriptor array. */
    private readFields(raw: Prisma.JsonValue): FormField[] {
        return (Array.isArray(raw) ? raw : []) as unknown as FormField[];
    }

    /**
     * Validate the submitted `data` against the form's fields: every `required`
     * field must be present and non-empty, and the email field must hold a valid
     * address (it is the Contact dedupe key, so always validated). Throws 400
     * naming the offending field. Returns the derived Contact attributes.
     */
    private validate(
        fields: FormField[],
        data: Record<string, unknown>,
    ): DerivedContact {
        const str = (name: string): string | undefined => {
            const v = data[name];
            if (typeof v === "string") {
                const t = v.trim();
                return t === "" ? undefined : t;
            }
            if (typeof v === "number" || typeof v === "boolean") {
                return String(v);
            }
            return undefined;
        };

        for (const field of fields) {
            if (field.required && str(field.name) === undefined) {
                throw new BadRequestException(
                    `Field "${field.name}" is required`,
                );
            }
        }

        const emailField = fields.find((f) => f.type === "email");
        if (!emailField) {
            // A well-formed form always has an email field (enforced at
            // create/update); defend the invariant here rather than trust it.
            throw new BadRequestException(
                "This form is misconfigured (no email field)",
            );
        }
        const email = (str(emailField.name) ?? "").toLowerCase();
        if (!EMAIL_RE.test(email)) {
            throw new BadRequestException(
                `Field "${emailField.name}" must be a valid email`,
            );
        }

        return {
            email,
            firstName: this.pick(fields, data, /first.?name|fname/i),
            lastName: this.pick(fields, data, /last.?name|lname|surname/i),
            fullName: this.pick(fields, data, /^(full.?)?name$|your.?name/i),
            phone:
                this.pick(fields, data, /phone|mobile|tel/i) ??
                this.pickByType(fields, data, "tel"),
            company: this.pick(
                fields,
                data,
                /company|organi[sz]ation|business/i,
            ),
        };
    }

    /** First non-empty value whose field NAME matches `re`. */
    private pick(
        fields: FormField[],
        data: Record<string, unknown>,
        re: RegExp,
    ): string | undefined {
        const field = fields.find((f) => re.test(f.name));
        return field ? this.value(data[field.name]) : undefined;
    }

    /** First non-empty value whose field TYPE matches `type`. */
    private pickByType(
        fields: FormField[],
        data: Record<string, unknown>,
        type: FieldType,
    ): string | undefined {
        const field = fields.find((f) => f.type === type);
        return field ? this.value(data[field.name]) : undefined;
    }

    private value(v: unknown): string | undefined {
        if (typeof v === "string") {
            const t = v.trim();
            return t === "" ? undefined : t;
        }
        if (typeof v === "number" || typeof v === "boolean") {
            return String(v);
        }
        return undefined;
    }

    /**
     * Upsert the Contact by `(organizationId, email)`: a repeat enquiry from the
     * same address updates the existing person (only the fields actually
     * supplied, so a sparse repeat never clobbers known values) rather than
     * forking a duplicate.
     */
    private upsertContact(
        tx: Prisma.TransactionClient,
        organizationId: string,
        formId: string,
        c: DerivedContact,
    ) {
        const first = c.firstName ?? this.splitName(c.fullName).first;
        const last = c.lastName ?? this.splitName(c.fullName).last;

        const update: Prisma.ContactUpdateInput = {};
        if (first !== undefined) update.firstName = first;
        if (last !== undefined) update.lastName = last;
        if (c.phone !== undefined) update.phone = c.phone;
        if (c.company !== undefined) update.company = c.company;

        return tx.contact.upsert({
            where: {
                organizationId_email: { organizationId, email: c.email },
            },
            update,
            create: {
                organizationId,
                email: c.email,
                firstName: first ?? null,
                lastName: last ?? null,
                phone: c.phone ?? null,
                company: c.company ?? null,
                source: `enquiry:form:${formId}`,
            },
        });
    }

    /**
     * Resolve the target Pipeline + entry Stage. Uses the form's `pipelineId`
     * when it names a same-org pipeline, else the org's default — creating a
     * `Sales` default (Stages New→Lost at order 0..4) the first time an org
     * receives an enquiry. The entry Stage is the lowest-order stage.
     */
    private async resolvePipeline(
        tx: Prisma.TransactionClient,
        organizationId: string,
        formPipelineId: string | null,
    ) {
        const withStages = {
            include: { stages: { orderBy: { order: "asc" as const } } },
        };

        let pipeline: PipelineWithStages | null = null;

        if (formPipelineId) {
            const named = await tx.pipeline.findUnique({
                where: { id: formPipelineId },
                ...withStages,
            });
            // Guard against a form pointing at another org's pipeline.
            if (named?.organizationId === organizationId) {
                pipeline = named;
            }
        }

        pipeline ??= await tx.pipeline.findFirst({
            where: { organizationId, isDefault: true },
            ...withStages,
        });

        pipeline ??= await tx.pipeline.create({
            data: {
                organizationId,
                name: "Sales",
                isDefault: true,
                stages: {
                    create: DEFAULT_STAGES.map((name, order) => ({
                        organizationId,
                        name,
                        order,
                    })),
                },
            },
            ...withStages,
        });

        if (pipeline.stages.length === 0) {
            // A pipeline with no stages can't host a lead — treat as a config error.
            throw new BadRequestException(
                "The target pipeline has no stages configured",
            );
        }
        const stage = pipeline.stages[0];

        return { pipeline, stage };
    }

    /** A readable lead title: the person's name (or email) plus the form name. */
    private leadTitle(c: DerivedContact, formName: string): string {
        // First non-empty of: joined first/last, split fullName, then email.
        const name =
            [
                [c.firstName, c.lastName].filter(Boolean).join(" ").trim(),
                this.splitName(c.fullName).joined,
                c.email,
            ].find((s) => (s ?? "").length > 0) ?? c.email;
        return `${name} — ${formName}`;
    }

    /** Split a single "full name" value into first / last parts. */
    private splitName(full: string | undefined): {
        first?: string;
        last?: string;
        joined?: string;
    } {
        if (!full) return {};
        const parts = full.split(/\s+/).filter(Boolean);
        if (parts.length === 0) return {};
        if (parts.length === 1) return { first: parts[0], joined: parts[0] };
        return {
            first: parts[0],
            last: parts.slice(1).join(" "),
            joined: full,
        };
    }

    private resultOf(submission: {
        id: string;
        leadId: string | null;
        contactId: string | null;
    }): EnquiryResult {
        return {
            submissionId: submission.id,
            leadId: submission.leadId ?? "",
            contactId: submission.contactId ?? "",
        };
    }
}

/** A Pipeline loaded together with its ordered Stages. */
type PipelineWithStages = Prisma.PipelineGetPayload<{
    include: { stages: true };
}>;

/** Contact attributes derived from a submission's data by field-name heuristics. */
interface DerivedContact {
    email: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    phone?: string;
    company?: string;
}
