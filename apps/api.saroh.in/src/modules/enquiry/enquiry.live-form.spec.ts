// #281: a submission is validated against the form the LIVE site shows, not
// against Form.fields, which the site editor rewrites on every autosave.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        form: { findUnique: jest.fn() },
        site: { findMany: jest.fn() },
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

import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { EnquiryService } from "./enquiry.service";
import { fieldsFromSnapshot } from "./live-form-fields";

const formFindUnique = prisma.form.findUnique as jest.Mock;
const siteFindMany = prisma.site.findMany as jest.Mock;
const submissionFindUnique = prisma.submission.findUnique as jest.Mock;
const submissionCreate = prisma.submission.create as jest.Mock;
const contactUpsert = prisma.contact.upsert as jest.Mock;
const pipelineFindFirst = prisma.pipeline.findFirst as jest.Mock;
const leadCreate = prisma.lead.create as jest.Mock;
const jobCreate = prisma.job.create as jest.Mock;
const activityCreate = prisma.activity.create as jest.Mock;

const email = { name: "email", label: "Email", type: "email", required: true };
const name = { name: "name", label: "Name", type: "text", required: true };
const budget = {
    name: "budget",
    label: "Budget",
    type: "text",
    required: true,
};
const phone = { name: "phone", label: "Phone", type: "tel", required: true };

function form(over: Record<string, unknown> = {}) {
    return {
        id: "form_1",
        organizationId: "org_1",
        siteId: null,
        status: "ACTIVE",
        deletedAt: null,
        pipelineId: null,
        name: "Ask us",
        fields: [email, name],
        ...over,
    };
}

function liveSite(fields: unknown[], formId = "form_1") {
    return {
        currentPublication: {
            snapshot: {
                site: { name: "Northwind Supply" },
                pages: [
                    {
                        path: "/",
                        title: "Home",
                        isHome: true,
                        sections: [
                            {
                                type: "hero",
                                contractVersion: 1,
                                content: { heading: "Northwind" },
                            },
                            {
                                type: "enquiry",
                                contractVersion: 1,
                                content: { formId, title: "Ask us", fields },
                            },
                        ],
                    },
                ],
            },
        },
    };
}

function wire(formRow: ReturnType<typeof form>, sites: unknown[]) {
    formFindUnique.mockResolvedValue(formRow);
    siteFindMany.mockResolvedValue(sites);
    submissionFindUnique.mockResolvedValue(null);
    pipelineFindFirst.mockResolvedValue({
        id: "pipe_1",
        organizationId: "org_1",
        isDefault: true,
        stages: [{ id: "stage_1", order: 0, name: "New" }],
    });
    contactUpsert.mockResolvedValue({ id: "contact_1" });
    leadCreate.mockResolvedValue({ id: "lead_1" });
    submissionCreate.mockResolvedValue({
        id: "sub_1",
        leadId: "lead_1",
        contactId: "contact_1",
    });
    jobCreate.mockResolvedValue({});
    activityCreate.mockResolvedValue({});
}

const visitor = { email: "priya@example.test", name: "Priya Raman" };
const service = new EnquiryService();

beforeEach(() => jest.clearAllMocks());

describe("EnquiryService.submit validates against the live form (#281)", () => {
    it("accepts the form the live site shows, even when a draft added a required field", async () => {
        wire(form({ fields: [email, name, budget] }), [
            liveSite([email, name]),
        ]);

        await expect(
            service.submit("form_1", visitor, undefined, undefined),
        ).resolves.toMatchObject({ leadId: "lead_1" });
        expect(leadCreate).toHaveBeenCalledTimes(1);
    });

    it("still enforces what the live form requires, even when a draft dropped it", async () => {
        wire(form({ fields: [email, name] }), [liveSite([email, name, phone])]);

        await expect(
            service.submit("form_1", visitor, undefined, undefined),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(leadCreate).not.toHaveBeenCalled();
    });

    it("falls back to Form.fields when no live publication carries the form", async () => {
        wire(form({ fields: [email, name, budget] }), [
            liveSite([email, name], "some_other_form"),
        ]);

        await expect(
            service.submit("form_1", visitor, undefined, undefined),
        ).rejects.toThrow(/budget/);
    });

    it("looks only at live sites in the form's own organization, and at its site when it records one", async () => {
        wire(form({ siteId: "site_1" }), []);

        await service.submit("form_1", visitor, undefined, undefined);

        expect(siteFindMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_1",
                    deletedAt: null,
                    currentPublicationId: { not: null },
                    id: "site_1",
                },
            }),
        );
    });
});

describe("fieldsFromSnapshot", () => {
    it("returns the fields of the enquiry section backed by the form", () => {
        const snapshot = liveSite([email, name]).currentPublication.snapshot;
        expect(fieldsFromSnapshot(snapshot, "form_1")).toEqual([email, name]);
    });

    it.each([
        null,
        undefined,
        "snapshot",
        42,
        {},
        { pages: "nope" },
        { pages: [null, { sections: {} }] },
    ])(
        "treats an unrecognised snapshot (%j) as not found, never a crash",
        (snapshot) => {
            expect(fieldsFromSnapshot(snapshot, "form_1")).toBeNull();
        },
    );

    it("ignores field entries this build does not recognise", () => {
        const snapshot = liveSite([
            email,
            { name: "colour", label: "Colour", type: "color-wheel" },
            "not a field",
        ]).currentPublication.snapshot;
        expect(fieldsFromSnapshot(snapshot, "form_1")).toEqual([email]);
    });
});
