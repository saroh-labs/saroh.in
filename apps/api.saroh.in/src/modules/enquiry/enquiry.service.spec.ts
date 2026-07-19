// DB-free unit tests: @saroh/database is mocked so nothing touches a real
// Postgres. The `$transaction` mock invokes its callback with the SAME mocked
// client, so every write inside the enquiry command is asserted to happen in the
// one transaction. The real Prisma namespace is kept for the JSON casts.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        form: { findUnique: jest.fn() },
        submission: { findUnique: jest.fn(), create: jest.fn() },
        contact: { upsert: jest.fn() },
        pipeline: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
        },
        lead: { create: jest.fn() },
        job: { create: jest.fn() },
        activity: { create: jest.fn() },
    };
    return {
        ...actual,
        prisma: {
            ...client,
            $transaction: jest.fn((cb: (tx: typeof client) => unknown) =>
                cb(client),
            ),
        },
    };
});

import { BadRequestException, GoneException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { EnquiryService } from "./enquiry.service";
import { FixedWindowRateLimiter } from "./rate-limiter";

const formFindUnique = prisma.form.findUnique as jest.Mock;
const submissionFindUnique = prisma.submission.findUnique as jest.Mock;
const submissionCreate = prisma.submission.create as jest.Mock;
const contactUpsert = prisma.contact.upsert as jest.Mock;
const pipelineFindUnique = prisma.pipeline.findUnique as jest.Mock;
const pipelineFindFirst = prisma.pipeline.findFirst as jest.Mock;
const pipelineCreate = prisma.pipeline.create as jest.Mock;
const leadCreate = prisma.lead.create as jest.Mock;
const jobCreate = prisma.job.create as jest.Mock;
const activityCreate = prisma.activity.create as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;

const FORM = {
    id: "form_1",
    organizationId: "org_FORM",
    status: "ACTIVE",
    deletedAt: null,
    pipelineId: null,
    name: "Contact us",
    fields: [
        { name: "email", label: "Email", type: "email", required: true },
        { name: "name", label: "Name", type: "text", required: true },
        { name: "phone", label: "Phone", type: "tel" },
    ],
};

const DEFAULT_PIPELINE = {
    id: "pipe_1",
    organizationId: "org_FORM",
    isDefault: true,
    stages: [
        { id: "stage_new", order: 0, name: "New" },
        { id: "stage_contacted", order: 1, name: "Contacted" },
    ],
};

/** Wire the happy path: form exists, no existing submission, default pipeline created. */
function wireHappyPath() {
    formFindUnique.mockResolvedValue(FORM);
    submissionFindUnique.mockResolvedValue(null);
    pipelineFindFirst.mockResolvedValue(null); // no default yet
    pipelineCreate.mockResolvedValue(DEFAULT_PIPELINE);
    contactUpsert.mockResolvedValue({ id: "contact_1" });
    leadCreate.mockResolvedValue({ id: "lead_1" });
    submissionCreate.mockResolvedValue({
        id: "sub_1",
        leadId: "lead_1",
        contactId: "contact_1",
    });
    jobCreate.mockResolvedValue({ id: "job_1" });
    activityCreate.mockResolvedValue({ id: "act_1" });
}

const validData = { email: "Jane@Example.com", name: "Jane Doe", phone: "123" };

describe("EnquiryService.submit — one submission produces one correct lead", () => {
    beforeEach(() => jest.clearAllMocks());

    it("creates exactly one Contact, Lead, Submission and Job in one transaction", async () => {
        const service = new EnquiryService();
        wireHappyPath();

        const res = await service.submit(
            "form_1",
            validData,
            undefined,
            "iphash",
        );

        expect(transaction).toHaveBeenCalledTimes(1);
        expect(contactUpsert).toHaveBeenCalledTimes(1);
        expect(leadCreate).toHaveBeenCalledTimes(1);
        expect(submissionCreate).toHaveBeenCalledTimes(1);
        expect(jobCreate).toHaveBeenCalledTimes(1);
        expect(activityCreate).toHaveBeenCalledTimes(1);

        expect(res).toEqual({
            submissionId: "sub_1",
            leadId: "lead_1",
            contactId: "contact_1",
        });

        // Lead lands at the lowest-order stage of the default pipeline, OPEN.
        expect(leadCreate.mock.calls[0][0].data).toMatchObject({
            pipelineId: "pipe_1",
            stageId: "stage_new",
            status: "OPEN",
            formId: "form_1",
            contactId: "contact_1",
        });

        // The outbox Job is the enquiry.notify type with the derived ids.
        expect(jobCreate.mock.calls[0][0].data).toMatchObject({
            type: "enquiry.notify",
            payload: {
                leadId: "lead_1",
                contactId: "contact_1",
                formId: "form_1",
                submissionId: "sub_1",
            },
        });
    });

    it("ISOLATION: every created row is stamped with form.organizationId, never a client value", async () => {
        const service = new EnquiryService();
        wireHappyPath();

        await service.submit("form_1", validData, undefined, "iphash");

        // The org is org_FORM (from the Form) on EVERY write — the submitter has
        // no way to influence it (submit() takes only formId + data).
        expect(contactUpsert.mock.calls[0][0]).toMatchObject({
            where: {
                organizationId_email: {
                    organizationId: "org_FORM",
                    email: "jane@example.com", // normalized lower-case
                },
            },
            create: expect.objectContaining({
                organizationId: "org_FORM",
                source: "enquiry:form:form_1",
            }),
        });
        expect(leadCreate.mock.calls[0][0].data.organizationId).toBe(
            "org_FORM",
        );
        expect(submissionCreate.mock.calls[0][0].data.organizationId).toBe(
            "org_FORM",
        );
        expect(jobCreate.mock.calls[0][0].data.organizationId).toBe("org_FORM");
        expect(activityCreate.mock.calls[0][0].data.organizationId).toBe(
            "org_FORM",
        );
    });

    it("persists the immutable Submission with the raw data, ipHash and idempotencyKey", async () => {
        const service = new EnquiryService();
        wireHappyPath();

        await service.submit("form_1", validData, "idem_1", "iphash");

        expect(submissionCreate.mock.calls[0][0].data).toMatchObject({
            formId: "form_1",
            contactId: "contact_1",
            leadId: "lead_1",
            data: validData,
            ipHash: "iphash",
            idempotencyKey: "idem_1",
        });
    });
});

describe("EnquiryService.submit — idempotency", () => {
    beforeEach(() => jest.clearAllMocks());

    it("replays the existing submission for a repeated (formId, idempotencyKey) — no second lead", async () => {
        const service = new EnquiryService();
        formFindUnique.mockResolvedValue(FORM);
        // A submission already exists for this key.
        submissionFindUnique.mockResolvedValue({
            id: "sub_1",
            leadId: "lead_1",
            contactId: "contact_1",
        });

        const res = await service.submit(
            "form_1",
            validData,
            "idem_1",
            "iphash",
        );

        expect(res).toEqual({
            submissionId: "sub_1",
            leadId: "lead_1",
            contactId: "contact_1",
        });
        // No new work: no transaction, no lead, no job.
        expect(transaction).not.toHaveBeenCalled();
        expect(leadCreate).not.toHaveBeenCalled();
        expect(jobCreate).not.toHaveBeenCalled();
    });

    it("backstops a race: catches P2002 on the unique key and replays the winner", async () => {
        const service = new EnquiryService();
        formFindUnique.mockResolvedValue(FORM);
        // Pre-check finds nothing, then the tx loses the race (P2002); the
        // post-catch re-read finds the winner.
        submissionFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
            id: "sub_win",
            leadId: "lead_win",
            contactId: "contact_win",
        });
        pipelineFindFirst.mockResolvedValue(DEFAULT_PIPELINE);
        contactUpsert.mockResolvedValue({ id: "contact_1" });
        leadCreate.mockResolvedValue({ id: "lead_1" });
        submissionCreate.mockRejectedValue({ code: "P2002" });

        const res = await service.submit(
            "form_1",
            validData,
            "idem_1",
            "iphash",
        );

        expect(res).toEqual({
            submissionId: "sub_win",
            leadId: "lead_win",
            contactId: "contact_win",
        });
    });
});

describe("EnquiryService.submit — validation (nothing created on failure)", () => {
    beforeEach(() => jest.clearAllMocks());

    it("400s when a required field is missing", async () => {
        const service = new EnquiryService();
        formFindUnique.mockResolvedValue(FORM);

        await expect(
            service.submit(
                "form_1",
                { email: "a@b.com" }, // 'name' is required but absent
                undefined,
                "iphash",
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(transaction).not.toHaveBeenCalled();
        expect(contactUpsert).not.toHaveBeenCalled();
    });

    it("400s when the email field is not a valid email", async () => {
        const service = new EnquiryService();
        formFindUnique.mockResolvedValue(FORM);

        await expect(
            service.submit(
                "form_1",
                { email: "not-an-email", name: "Jane" },
                undefined,
                "iphash",
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(transaction).not.toHaveBeenCalled();
    });
});

describe("EnquiryService.submit — form gating", () => {
    beforeEach(() => jest.clearAllMocks());

    it("404s a missing form", async () => {
        const service = new EnquiryService();
        formFindUnique.mockResolvedValue(null);
        await expect(
            service.submit("nope", validData, undefined, "iphash"),
        ).rejects.toThrow(/not found/i);
        expect(transaction).not.toHaveBeenCalled();
    });

    it("410s an ARCHIVED (inactive) form", async () => {
        const service = new EnquiryService();
        formFindUnique.mockResolvedValue({ ...FORM, status: "ARCHIVED" });
        await expect(
            service.submit("form_1", validData, undefined, "iphash"),
        ).rejects.toBeInstanceOf(GoneException);
        expect(transaction).not.toHaveBeenCalled();
    });
});

describe("EnquiryService.submit — rate limiting", () => {
    beforeEach(() => jest.clearAllMocks());

    it("429s the N+1th rapid submit from the same ipHash", async () => {
        // Limit of 2 per window.
        const service = new EnquiryService(
            new FixedWindowRateLimiter(2, 60_000),
        );
        wireHappyPath();

        await service.submit("form_1", validData, undefined, "same_ip");
        await service.submit("form_1", validData, undefined, "same_ip");

        // Third within the window is rejected.
        let status: number | undefined;
        try {
            await service.submit("form_1", validData, undefined, "same_ip");
        } catch (err) {
            status = (err as { getStatus(): number }).getStatus();
        }
        expect(status).toBe(429);
        // The 429 short-circuits before the transaction.
        expect(transaction).toHaveBeenCalledTimes(2);
    });

    it("does not rate-limit a different ipHash", async () => {
        const service = new EnquiryService(
            new FixedWindowRateLimiter(1, 60_000),
        );
        wireHappyPath();

        await service.submit("form_1", validData, undefined, "ip_a");
        // Same form, DIFFERENT ip — its own bucket, allowed.
        await expect(
            service.submit("form_1", validData, undefined, "ip_b"),
        ).resolves.toMatchObject({ leadId: "lead_1" });
    });
});
