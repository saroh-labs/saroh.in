import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { EntitlementService } from "../billing/entitlement.service";
import { ContactsService } from "../contacts/contacts.service";
import { EnquiryService } from "../enquiry/enquiry.service";
import { FormsService } from "../forms/forms.service";
import { LeadsService } from "../leads/leads.service";
import { PipelinesService } from "../pipelines/pipelines.service";
import { SitesService } from "../sites/sites.service";

/**
 * S3-008 — first-journey E2E (DB-backed integration).
 *
 * Drives the REAL services against the REAL test database to prove the whole
 * "account → Organization → site → enquiry → pipeline" funnel works end to end,
 * PLUS a two-Organization adversarial isolation case. It intentionally does NOT
 * mock `@saroh/database`, so it runs ONLY in the integration jest project
 * (`jest.integration.config.js`, whose testMatch covers every spec under
 * `src/modules`); it is not listed by any glob in the unit project
 * (`jest.config.js`), so it is never double-run. The harness resets the schema
 * in globalSetup and TRUNCATEs after this file, so it owns a clean database for
 * its lifetime.
 *
 * Each numbered `it` is one journey step and asserts that step's contract. The
 * steps are ordered and share state (a real funnel is inherently sequential):
 * a site is created, a form is bound to it, the site is published, a public
 * visitor submits the form, and the resulting Lead is worked through the
 * pipeline — all in orgA. Step 10 introduces orgB and proves tenant isolation.
 */
describe("First journey E2E — account → org → site → enquiry → pipeline (dev DB)", () => {
    // Services constructed directly against the shared `prisma` singleton, the
    // same wiring the existing DB-backed specs use (e.g. products.service.spec).
    // SitesService took no dependencies when this spec was written; S7-005 gave
    // it an EntitlementService so `createFromTemplate` can enforce the plan's
    // `sites` cap. Without one it reached `this.entitlements.check` on
    // undefined, and every later step failed on the site that was never made.
    const sites = new SitesService(new EntitlementService());
    const forms = new FormsService();
    const enquiry = new EnquiryService();
    const pipelines = new PipelinesService();
    const leads = new LeadsService(pipelines);
    const contacts = new ContactsService();

    // orgA: the happy-path tenant. orgB: the adversary in step 10.
    const userAEmail = `journey-a-${process.pid}@example.com`;
    const userBEmail = `journey-b-${process.pid}@example.com`;
    const visitorEmail = `visitor-${process.pid}@example.com`;

    let ctxA: OrganizationContext;
    let ctxB: OrganizationContext;

    // State threaded across the ordered steps.
    let siteId = "";
    let formId = "";
    let submissionId = "";
    let leadId = "";
    let contactId = "";
    let defaultPipelineId = "";
    let entryStageId = ""; // lowest-order stage (the enquiry entry point)
    let nextStageId = ""; // the stage we move the lead into (step 8)
    let taskId = "";

    // The public form fields — one of them is the REQUIRED email field, which
    // is the Contact dedupe key for the enquiry command.
    const formFields = [
        {
            name: "name",
            label: "Your name",
            type: "text" as const,
            required: true,
        },
        {
            name: "email",
            label: "Email",
            type: "email" as const,
            required: true,
        },
        { name: "message", label: "Message", type: "textarea" as const },
    ];
    const submission = {
        name: "Dana Prospect",
        email: visitorEmail,
        message: "I'd love a demo of your product.",
    };

    afterAll(async () => {
        // The harness TRUNCATEs + disconnects after the file; disconnect here too
        // so a failure before that hook still releases the connection cleanly.
        await prisma.$disconnect();
    });

    // ------------------------------------------------------------------
    // Step 1 — Account + Organization exist (seed).
    // ------------------------------------------------------------------
    it("1. seeds two accounts + two organizations, each with an OWNER membership", async () => {
        const userA = await prisma.user.create({ data: { email: userAEmail } });
        const userB = await prisma.user.create({ data: { email: userBEmail } });

        const orgA = await prisma.organization.create({
            data: {
                name: "Acme Studio",
                slug: `acme-${process.pid}`,
                memberships: { create: { userId: userA.id, role: "OWNER" } },
            },
        });
        const orgB = await prisma.organization.create({
            data: {
                name: "Rival Works",
                slug: `rival-${process.pid}`,
                memberships: { create: { userId: userB.id, role: "OWNER" } },
            },
        });

        ctxA = { organizationId: orgA.id, userId: userA.id, role: "OWNER" };
        ctxB = { organizationId: orgB.id, userId: userB.id, role: "OWNER" };

        const ownerA = await prisma.membership.findFirst({
            where: { organizationId: orgA.id, userId: userA.id },
        });
        expect(ownerA?.role).toBe("OWNER");
        const ownerB = await prisma.membership.findFirst({
            where: { organizationId: orgB.id, userId: userB.id },
        });
        expect(ownerB?.role).toBe("OWNER");
    });

    // ------------------------------------------------------------------
    // Step 2 — Create a Site from a template.
    // ------------------------------------------------------------------
    it("2. creates a Site from a template, owned by orgA", async () => {
        const created = await sites.createFromTemplate(ctxA, {
            name: "Acme Marketing Site",
        });
        siteId = created.siteId;
        expect(siteId).toBeTruthy();

        const site = await prisma.site.findUnique({ where: { id: siteId } });
        expect(site?.organizationId).toBe(ctxA.organizationId);
        // A template lays down at least one page (the home page).
        const pageCount = await prisma.page.count({ where: { siteId } });
        expect(pageCount).toBeGreaterThan(0);
    });

    // ------------------------------------------------------------------
    // Step 3 — Create an enquiry Form (with an email field) for the site.
    // ------------------------------------------------------------------
    it("3. creates an enquiry Form (incl. an email field) bound to the site", async () => {
        const form = await forms.create(ctxA, {
            name: "Contact us",
            fields: formFields,
            siteId,
        });
        formId = form.id;
        expect(form.organizationId).toBe(ctxA.organizationId);
        expect(form.siteId).toBe(siteId);
        expect(form.status).toBe("ACTIVE");
        const fields = form.fields as unknown as Array<{ type: string }>;
        expect(fields.some((f) => f.type === "email")).toBe(true);
    });

    // ------------------------------------------------------------------
    // Step 4 — Publish the site.
    // ------------------------------------------------------------------
    it("4. publishes the site — an immutable Publication exists and is current", async () => {
        const result = await sites.publishSite(ctxA, siteId);
        expect(result.publicationId).toBeTruthy();

        const publication = await prisma.publication.findUnique({
            where: { id: result.publicationId },
        });
        expect(publication?.organizationId).toBe(ctxA.organizationId);
        expect(publication?.siteId).toBe(siteId);

        const site = await prisma.site.findUnique({ where: { id: siteId } });
        expect(site?.currentPublicationId).toBe(result.publicationId);
    });

    // ------------------------------------------------------------------
    // Step 5 — Public enquiry submit (NO org context).
    // ------------------------------------------------------------------
    it("5. accepts a public enquiry submission with no org context", async () => {
        const result = await enquiry.submit(
            formId,
            submission,
            undefined,
            undefined,
        );
        expect(result.submissionId).toBeTruthy();
        expect(result.leadId).toBeTruthy();
        expect(result.contactId).toBeTruthy();

        submissionId = result.submissionId;
        leadId = result.leadId;
        contactId = result.contactId;
    });

    // ------------------------------------------------------------------
    // Step 6 — A Contact was created in orgA, deduped by email.
    // ------------------------------------------------------------------
    it("6. creates the Contact in orgA (org derived from the form), keyed by email", async () => {
        const contact = await prisma.contact.findUnique({
            where: {
                organizationId_email: {
                    organizationId: ctxA.organizationId,
                    email: visitorEmail,
                },
            },
        });
        expect(contact?.id).toBe(contactId);
        expect(contact?.organizationId).toBe(ctxA.organizationId);

        // Exactly one contact row for this email in orgA (the dedupe key).
        const dupes = await prisma.contact.count({
            where: { organizationId: ctxA.organizationId, email: visitorEmail },
        });
        expect(dupes).toBe(1);

        // The org was NEVER taken from the submitter — orgB has no such contact.
        const inB = await prisma.contact.count({
            where: { organizationId: ctxB.organizationId, email: visitorEmail },
        });
        expect(inB).toBe(0);
    });

    // ------------------------------------------------------------------
    // Step 7 — Exactly one Lead at the entry stage, + Submission + Job.
    // ------------------------------------------------------------------
    it("7. creates exactly one Lead at the default pipeline's entry stage, with a Submission + notify Job", async () => {
        // The enquiry command created orgA's default pipeline on first use.
        const pipeline = await prisma.pipeline.findFirst({
            where: { organizationId: ctxA.organizationId, isDefault: true },
            include: { stages: { orderBy: { order: "asc" } } },
        });
        expect(pipeline).toBeTruthy();
        defaultPipelineId = pipeline!.id;
        entryStageId = pipeline!.stages[0].id;
        nextStageId = pipeline!.stages[1].id;
        expect(pipeline!.stages[0].order).toBe(0);

        // Exactly one lead in orgA, and it is our enquiry lead.
        const orgLeads = await prisma.lead.findMany({
            where: { organizationId: ctxA.organizationId },
        });
        expect(orgLeads).toHaveLength(1);
        const lead = orgLeads[0];
        expect(lead.id).toBe(leadId);
        expect(lead.contactId).toBe(contactId);
        expect(lead.formId).toBe(formId);
        expect(lead.pipelineId).toBe(defaultPipelineId);
        // Landed at the lowest-order (entry) stage.
        expect(lead.stageId).toBe(entryStageId);

        // The immutable Submission is linked to the same contact + lead + form.
        const submissionRow = await prisma.submission.findUnique({
            where: { id: submissionId },
        });
        expect(submissionRow?.organizationId).toBe(ctxA.organizationId);
        expect(submissionRow?.formId).toBe(formId);
        expect(submissionRow?.leadId).toBe(leadId);
        expect(submissionRow?.contactId).toBe(contactId);

        // The transactional-outbox Job exists for the notification.
        const jobs = await prisma.job.findMany({
            where: {
                organizationId: ctxA.organizationId,
                type: "enquiry.notify",
            },
        });
        expect(jobs).toHaveLength(1);
        const payload = jobs[0].payload as {
            leadId?: string;
            submissionId?: string;
        };
        expect(payload.leadId).toBe(leadId);
        expect(payload.submissionId).toBe(submissionId);
    });

    // ------------------------------------------------------------------
    // Step 8 — Move the lead to the next stage (atomic STAGE_CHANGED).
    // ------------------------------------------------------------------
    it("8. moves the lead to the next stage and writes a STAGE_CHANGED activity atomically", async () => {
        const moved = await leads.move(ctxA, leadId, { stageId: nextStageId });
        expect(moved.stageId).toBe(nextStageId);

        // The stage change is reflected on the persisted lead...
        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        expect(lead?.stageId).toBe(nextStageId);

        // ...and a STAGE_CHANGED activity was appended in the same transaction.
        const stageChanged = await prisma.activity.findFirst({
            where: {
                leadId,
                organizationId: ctxA.organizationId,
                type: "STAGE_CHANGED",
            },
        });
        expect(stageChanged).toBeTruthy();
        expect(stageChanged?.actorUserId).toBe(ctxA.userId);
    });

    // ------------------------------------------------------------------
    // Step 9 — Log a note + create and complete a follow-up TASK.
    // ------------------------------------------------------------------
    it("9. logs a note and creates + completes a follow-up TASK; timeline reflects both", async () => {
        const note = await leads.logActivity(ctxA, leadId, {
            body: "Called the prospect — interested, sending pricing.",
        });
        expect(note.type).toBe("NOTE");

        const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const task = await leads.createTask(ctxA, leadId, {
            body: "Follow up on pricing",
            dueAt,
        });
        taskId = task.id;
        expect(task.type).toBe("TASK");
        expect(task.completedAt).toBeNull();

        const completed = await leads.completeTask(ctxA, leadId, taskId);
        expect(completed.completedAt).not.toBeNull();

        // The timeline (via the read model) reflects the note + the completed task.
        const detail = await leads.get(ctxA, leadId);
        const types = detail.activities.map((a) => a.type);
        expect(types).toContain("NOTE");
        expect(types).toContain("TASK");
        const timelineTask = detail.activities.find((a) => a.id === taskId);
        expect(timelineTask?.completedAt).not.toBeNull();
    });

    // ------------------------------------------------------------------
    // Step 10 — Adversarial two-org isolation.
    // ------------------------------------------------------------------
    it("10. isolates tenants: orgB cannot see orgA's lead/contact, and a re-submit still lands in orgA", async () => {
        // orgB (a fully separate OWNER context) cannot read orgA's rows — a 404,
        // never a 403, so orgB can't even prove they exist.
        await expect(leads.get(ctxB, leadId)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(contacts.get(ctxB, contactId)).rejects.toBeInstanceOf(
            NotFoundException,
        );

        // orgB's own CRM is empty.
        expect(await contacts.list(ctxB)).toHaveLength(0);
        expect(await leads.list(ctxB)).toHaveLength(0);

        // The submitter can NEVER force the owning org: re-submitting orgA's form
        // lands the new lead in orgA, derived from the form — not orgB.
        const replay = await enquiry.submit(
            formId,
            submission,
            undefined,
            undefined,
        );
        expect(replay.leadId).not.toBe(leadId); // a new lead (no idempotency key)
        const newLead = await prisma.lead.findUnique({
            where: { id: replay.leadId },
        });
        expect(newLead?.organizationId).toBe(ctxA.organizationId);

        // Contact is still deduped by email — one Contact, now two leads, in orgA.
        expect(replay.contactId).toBe(contactId);
        const contactCount = await prisma.contact.count({
            where: { organizationId: ctxA.organizationId, email: visitorEmail },
        });
        expect(contactCount).toBe(1);
        const orgALeadCount = await prisma.lead.count({
            where: { organizationId: ctxA.organizationId },
        });
        expect(orgALeadCount).toBe(2);

        // And orgB STILL sees nothing after orgA's activity.
        expect(await leads.list(ctxB)).toHaveLength(0);
        expect(await contacts.list(ctxB)).toHaveLength(0);
    });
});
