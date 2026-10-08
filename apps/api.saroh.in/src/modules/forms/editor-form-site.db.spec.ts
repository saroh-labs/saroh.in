/**
 * An enquiry form made in the site editor belongs to its site, and what the
 * visitor wrote shows on the lead and the contact (UX-002), against a real
 * Postgres.
 *
 * The editor used to save its forms with `siteId` NULL: the site's Forms tab
 * filters by site, so it said "No forms on this site", the entries page
 * 404ed, and the lead and contact showed only an email. The message was in
 * the database and on no screen.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ContactsService } from "../contacts/contacts.service";
import { EnquiryService } from "../enquiry/enquiry.service";
import { LeadsService } from "../leads/leads.service";
import { PipelinesService } from "../pipelines/pipelines.service";
import { FormsService } from "./forms.service";

const forms = new FormsService();
const enquiries = new EnquiryService();
const leads = new LeadsService(new PipelinesService());
const contacts = new ContactsService();

const fields = [
    { name: "email", label: "Email", type: "email" as const, required: true },
    { name: "message", label: "Message", type: "textarea" as const },
];

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

async function business() {
    const org = await prisma.organization.create({
        data: { name: "Northwind enquiries", slug: uniq("ux2-org-") },
    });
    const owner = await prisma.user.create({
        data: { email: `${uniq("ux2-owner-")}@example.test`, name: "Asha" },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Northwind",
            slug: uniq("ux2-site-"),
        },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: owner.id,
        role: "OWNER",
    };
    return { org, owner, site, ctx };
}

/** An enquiry section on the site's draft home page, pointing at `formId`. */
async function sectionFor(
    b: Awaited<ReturnType<typeof business>>,
    formId: string,
) {
    const page = await prisma.page.create({
        data: {
            siteId: b.site.id,
            organizationId: b.org.id,
            path: "/",
            title: "Home",
            isHome: true,
        },
    });
    const version = await prisma.pageVersion.create({
        data: {
            pageId: page.id,
            organizationId: b.org.id,
            status: "DRAFT",
            createdByUserId: b.owner.id,
        },
    });
    await prisma.section.create({
        data: {
            pageVersionId: version.id,
            organizationId: b.org.id,
            type: "enquiry",
            contractVersion: 1,
            order: 0,
            key: "ask",
            content: { formId, title: "Ask us", fields },
        },
    });
}

describe("a form made in the site editor (UX-002)", () => {
    it("is saved with its site, and listed on it", async () => {
        const b = await business();
        // What the editor's first save sends now.
        const form = await forms.create(b.ctx, {
            name: "Ask us",
            fields,
            siteId: b.site.id,
        });
        expect(form.siteId).toBe(b.site.id);

        const listed = await forms.list(b.ctx);
        expect(listed.filter((f) => f.siteId === b.site.id)).toHaveLength(1);
    });

    it("binds a form saved without a site on the editor's next save", async () => {
        const b = await business();
        const orphan = await prisma.form.create({
            data: { organizationId: b.org.id, name: "Ask us", fields },
        });

        await forms.update(b.ctx, orphan.id, {
            name: "Ask us",
            fields,
            siteId: b.site.id,
        });

        const after = await prisma.form.findUniqueOrThrow({
            where: { id: orphan.id },
        });
        expect(after.siteId).toBe(b.site.id);
    });

    it("shows what the visitor wrote on the lead and the contact", async () => {
        const b = await business();
        const form = await forms.create(b.ctx, {
            name: "Ask us",
            fields,
            siteId: b.site.id,
        });
        const visitor = `${uniq("ux2-visitor-")}@example.test`;

        const sent = await enquiries.submit(
            form.id,
            { email: visitor, message: "Do you open on Sundays?" },
            undefined,
            undefined,
        );

        const lead = await leads.get(b.ctx, sent.leadId);
        expect(lead.enquiries).toHaveLength(1);
        expect(lead.enquiries[0]).toMatchObject({
            formId: form.id,
            formName: "Ask us",
            answers: [
                { name: "email", label: "Email", value: visitor },
                {
                    name: "message",
                    label: "Message",
                    value: "Do you open on Sundays?",
                },
            ],
        });

        const contact = await contacts.get(b.ctx, lead.contactId ?? "");
        expect(contact.enquiries.map((e) => e.answers[1]?.value)).toEqual([
            "Do you open on Sundays?",
        ]);

        // Another business never reads them.
        const other = await business();
        await expect(leads.get(other.ctx, sent.leadId)).rejects.toThrow(
            /not found/i,
        );
    });
});

describe("the backfill of forms the editor left without a site (UX-002)", () => {
    const sql = readFileSync(
        path.resolve(
            __dirname,
            "../../../../../packages/database/prisma/migrations/20261029124100_form_site_backfill/migration.sql",
        ),
        "utf8",
    )
        .replace(/^\s*--.*$/gm, "")
        .split(/;\s*$/m)
        .map((s) => s.trim())
        .filter(Boolean);

    /** Run the migration inside a transaction, read, then roll it back. */
    async function backfilled(formIds: string[]) {
        const rolledBack = new Error("rollback");
        let read: { id: string; siteId: string | null }[] = [];
        await prisma
            .$transaction(async (tx) => {
                for (const statement of sql) {
                    await tx.$executeRawUnsafe(statement);
                }
                read = await tx.form.findMany({
                    where: { id: { in: formIds } },
                    select: { id: true, siteId: true },
                });
                throw rolledBack;
            })
            .catch((err: unknown) => {
                if (err !== rolledBack) throw err;
            });
        return new Map(read.map((f) => [f.id, f.siteId]));
    }

    it("binds a form to the site whose section holds it, and to a business's only site", async () => {
        // Two sites: only the section can say which one.
        const b = await business();
        const second = await prisma.site.create({
            data: {
                organizationId: b.org.id,
                name: "Northwind two",
                slug: uniq("ux2-site-"),
            },
        });
        const held = await prisma.form.create({
            data: { organizationId: b.org.id, name: "Held", fields },
        });
        await sectionFor(b, held.id);
        const loose = await prisma.form.create({
            data: { organizationId: b.org.id, name: "Loose", fields },
        });
        const onSecond = await prisma.form.create({
            data: {
                organizationId: b.org.id,
                siteId: second.id,
                name: "Already bound",
                fields,
            },
        });

        // One site: everything unbound goes to it.
        const single = await business();
        const lone = await prisma.form.create({
            data: { organizationId: single.org.id, name: "Lone", fields },
        });

        const after = await backfilled([
            held.id,
            loose.id,
            onSecond.id,
            lone.id,
        ]);
        expect(after.get(held.id)).toBe(b.site.id);
        // Two sites and no section: no telling which, so left alone.
        expect(after.get(loose.id)).toBeNull();
        // A form already on a site never moves.
        expect(after.get(onSecond.id)).toBe(second.id);
        expect(after.get(lone.id)).toBe(single.site.id);
    });
});
