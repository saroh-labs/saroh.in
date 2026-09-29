/**
 * Needs attention (DEC-040, C1) against a real Postgres: sensitive entries
 * reach only who may read them, Allergy entries name the business's own
 * allergens and alone hold one on the list, and Order Detail's allergy
 * banner reads them — never the notes, which are text only (Z2a).
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { AllergensService } from "../catalogue/allergens.service";
import { attentionFor } from "./attention-read";
import { ContactAttentionService } from "./contact-attention.service";
import { ContactNotesService } from "./contact-notes.service";
import { CustomerDetailService } from "./customer-detail.service";

const tag = `${process.pid}-${Date.now()}`;

const availability = {
    listViews: jest.fn().mockResolvedValue(
        ["CRM", "COMMERCE", "APPOINTMENTS", "PAYMENTS"].map((key) => ({
            key,
            readiness: "ACTIVE",
        })),
    ),
} as unknown as ModuleAvailabilityService;

const attention = new ContactAttentionService();
const details = new CustomerDetailService(availability);
const notes = new ContactNotesService();
const allergens = new AllergensService();

/**
 * What Order Detail's banner is built from: each Allergy entry's allergens
 * (`allergyNotesOf`, apps/app.saroh.in/lib/orders/attention.ts).
 */
function bannerInput(
    entries: {
        kind: string;
        allergen: { id: string } | null;
        matchAllergens: { id: string }[];
    }[],
) {
    return entries
        .filter((e) => e.kind === "ALLERGY")
        .map((e) =>
            (e.matchAllergens.length
                ? e.matchAllergens
                : e.allergen
                  ? [e.allergen]
                  : []
            )
                .map((a) => a.id)
                .sort(),
        )
        .filter((ids) => ids.length > 0);
}

describe("Needs attention (DB)", () => {
    let ownerId = "";
    let owner: OrganizationContext;
    let admin: OrganizationContext;
    let member: OrganizationContext;
    let otherOrgId = "";
    let contactId = "";
    let otherContactId = "";
    let sesameId = "";
    let peanutsId = "";
    let otherAllergenId = "";

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: {
                    email: `attention-owner-${tag}@example.com`,
                    name: "Nisha",
                },
            })
        ).id;
        const org = await prisma.organization.create({
            data: { name: "Rye & Co.", slug: `attention-org-${tag}` },
        });
        owner = { organizationId: org.id, userId: ownerId, role: "OWNER" };
        admin = { ...owner, role: "ADMIN" };
        member = { ...owner, role: "MEMBER" };
        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Elsewhere", slug: `attention-other-${tag}` },
            })
        ).id;
        contactId = (
            await prisma.contact.create({
                data: {
                    organizationId: org.id,
                    email: `asha-${tag}@example.com`,
                    firstName: "Asha",
                },
            })
        ).id;
        otherContactId = (
            await prisma.contact.create({
                data: {
                    organizationId: otherOrgId,
                    email: `ravi-${tag}@example.com`,
                    firstName: "Ravi",
                },
            })
        ).id;
        [sesameId, peanutsId] = (
            await allergens.add(org.id, ["Sesame", "Peanuts"])
        ).map((a) => a.id);
        otherAllergenId = (
            await prisma.storeAllergen.create({
                data: { organizationId: otherOrgId, name: "Mustard" },
            })
        ).id;
    });

    afterAll(async () => {
        const orgIds = [owner.organizationId, otherOrgId];
        const where = { organizationId: { in: orgIds } };
        await prisma.contactAttention.deleteMany({ where });
        await prisma.contactNoteAllergen.deleteMany({ where });
        await prisma.contactNote.deleteMany({ where });
        await prisma.contact.deleteMany({ where });
        await prisma.storeAllergen.deleteMany({ where });
        await prisma.auditEvent.deleteMany({ where });
        await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
        await prisma.user.deleteMany({ where: { id: ownerId } });
    });

    it("keeps a Medical entry from a Member, who is told one is there", async () => {
        const made = await attention.create(owner, contactId, {
            kind: "MEDICAL",
            label: "Blood thinners",
        });
        expect(made).toMatchObject({
            kind: "MEDICAL",
            sensitive: true,
            source: "STAFF",
            status: "ACTIVE",
            addedBy: "Nisha",
        });

        const forOwner = await attention.list(owner, contactId);
        expect(forOwner.entries.map((e) => e.label)).toEqual([
            "Blood thinners",
        ]);
        expect(forOwner.hiddenSensitiveCount).toBe(0);

        const forMember = await attention.list(member, contactId);
        expect(forMember.entries).toEqual([]);
        expect(forMember.hiddenSensitiveCount).toBe(1);
        expect(JSON.stringify(forMember)).not.toContain("Blood thinners");

        // The detail carries the same, per viewer.
        const detail = await details.detail(member, contactId);
        expect(detail.attention).toMatchObject({
            from: "contact",
            entries: [],
            hiddenSensitiveCount: 1,
        });
        expect(JSON.stringify(detail)).not.toContain("Blood thinners");
        expect(
            (await details.detail(owner, contactId)).attention?.entries,
        ).toHaveLength(1);

        // Activity says what kind, never what it says (DEC-035).
        const audit = await prisma.auditEvent.findFirst({
            where: { targetId: made.id },
        });
        expect(audit?.action).toBe("contact.attention.created");
        expect(JSON.stringify(audit)).not.toContain("thinners");

        await attention.remove(owner, contactId, made.id);
    });

    it("refuses a Member's write, and lets an Admin edit a sensitive entry", async () => {
        await expect(
            attention.create(member, contactId, {
                kind: "OTHER",
                label: "VIP",
            }),
        ).rejects.toThrow("Your role can't change customers' details.");

        const made = await attention.create(owner, contactId, {
            kind: "MEDICAL",
            label: "Diabetic",
        });
        const edited = await attention.update(admin, contactId, made.id, {
            detail: "Type 1; carries insulin",
        });
        expect(edited).toMatchObject({
            label: "Diabetic",
            detail: "Type 1; carries insulin",
            sensitive: true,
        });

        await attention.remove(admin, contactId, made.id);
        const row = await prisma.contactAttention.findUnique({
            where: { id: made.id },
        });
        // Removed, not deleted.
        expect(row?.removedAt).toBeInstanceOf(Date);
        expect(
            (await attention.list(owner, contactId)).entries.map((e) => e.id),
        ).not.toContain(made.id);
    });

    it("is a 404 for another business's allergen or contact", async () => {
        await expect(
            attention.create(owner, contactId, {
                kind: "ALLERGY",
                allergenId: otherAllergenId,
            }),
        ).rejects.toThrow("Allergen not found");
        await expect(
            attention.create(owner, otherContactId, {
                kind: "OTHER",
                label: "VIP",
            }),
        ).rejects.toThrow("Contact not found");
        await expect(attention.list(owner, otherContactId)).rejects.toThrow(
            "Contact not found",
        );
        // And the other business's entries never come back to this one.
        const theirs = await prisma.contactAttention.create({
            data: {
                organizationId: otherOrgId,
                contactId: otherContactId,
                kind: "OTHER",
                label: "Theirs",
            },
        });
        const read = await attentionFor(owner, [otherContactId]);
        expect(read.get(otherContactId)?.entries).toEqual([]);
        await expect(
            attention.update(owner, otherContactId, theirs.id, {
                label: "Mine",
            }),
        ).rejects.toThrow("Entry not found");
    });

    it("refuses to take an allergen off the list while an entry names it", async () => {
        const entry = await attention.create(owner, contactId, {
            kind: "ALLERGY",
            allergenId: peanutsId,
        });
        expect(entry.label).toBe("Peanuts");
        await expect(
            attention.create(owner, contactId, {
                kind: "ALLERGY",
                allergenId: peanutsId,
            }),
        ).rejects.toThrow("This allergy is already on their list.");

        await expect(
            allergens.remove(owner.organizationId, peanutsId),
        ).rejects.toThrow(
            "Peanuts is on 1 customer's Needs attention — take it off first.",
        );

        await attention.remove(owner, contactId, entry.id);
        await expect(
            allergens.remove(owner.organizationId, peanutsId),
        ).resolves.toEqual({ id: peanutsId, name: "Peanuts" });
        // The removed entry lets it go and keeps its label.
        const row = await prisma.contactAttention.findUnique({
            where: { id: entry.id },
        });
        expect(row).toMatchObject({ allergenId: null, label: "Peanuts" });

        peanutsId =
            (await allergens.add(owner.organizationId, ["Peanuts"])).find(
                (a) => a.name === "Peanuts",
            )?.id ?? "";
    });

    it("builds the allergy banner from Needs attention, never the notes (Z2a)", async () => {
        await prisma.contactAttention.deleteMany({ where: { contactId } });

        // A note from before Z2a that names sesame: nothing reads it now.
        const old = await prisma.contactNote.create({
            data: {
                organizationId: owner.organizationId,
                contactId,
                body: "Sesame allergy",
                createdByUserId: ownerId,
            },
        });
        await prisma.contactNoteAllergen.create({
            data: {
                noteId: old.id,
                allergenId: sesameId,
                organizationId: owner.organizationId,
            },
        });
        await attention.create(owner, contactId, {
            kind: "ALLERGY",
            allergenId: peanutsId,
        });

        const read = await details.detail(member, contactId);
        expect(bannerInput(read.attention?.entries ?? [])).toEqual([
            [peanutsId],
        ]);
        expect(read.allergens).toEqual([{ id: peanutsId, name: "Peanuts" }]);
        const note = read.notes?.rows.find((n) => n.id === old.id);
        expect(note).toMatchObject({
            body: "Sesame allergy",
            allergens: [],
            matchAllergens: [],
        });

        await prisma.contactNote.delete({ where: { id: old.id } });
        await prisma.contactAttention.deleteMany({ where: { contactId } });
    });

    it("lets an allergen go that only notes from before Z2a name", async () => {
        const [mustard] = (
            await allergens.add(owner.organizationId, ["Mustard"])
        ).filter((a) => a.name === "Mustard");
        const old = await prisma.contactNote.create({
            data: {
                organizationId: owner.organizationId,
                contactId,
                body: "Mustard, a little",
            },
        });
        await prisma.contactNoteAllergen.create({
            data: {
                noteId: old.id,
                allergenId: mustard.id,
                organizationId: owner.organizationId,
            },
        });

        await expect(
            allergens.remove(owner.organizationId, mustard.id),
        ).resolves.toEqual({ id: mustard.id, name: "Mustard" });
        expect(
            await prisma.contactNoteAllergen.count({
                where: { noteId: old.id },
            }),
        ).toBe(0);
        expect(
            await prisma.contactNote.findUnique({ where: { id: old.id } }),
        ).toMatchObject({ body: "Mustard, a little" });

        await prisma.contactNote.delete({ where: { id: old.id } });
    });

    it("puts the allergens an older app sends with a note on Needs attention, not the note", async () => {
        await prisma.contactAttention.deleteMany({ where: { contactId } });

        const note = await notes.create(owner, contactId, {
            body: "Sesame, badly",
            allergenIds: [sesameId],
        });
        await expect(
            notes.create(owner, contactId, { allergenIds: [sesameId] }),
        ).rejects.toThrow("Write a note.");

        const read = await attention.list(owner, contactId);
        expect(
            read.entries.map((e) => [e.kind, e.label, e.allergen?.id]),
        ).toEqual([["ALLERGY", "Sesame", sesameId]]);
        expect(
            await prisma.contactNoteAllergen.count({
                where: { noteId: note.id },
            }),
        ).toBe(0);
        await notes.remove(owner, contactId, note.id);
    });

    it("confirms a suggestion onto the record", async () => {
        const suggestion = await prisma.contactAttention.create({
            data: {
                organizationId: owner.organizationId,
                contactId,
                kind: "OTHER",
                label: "Nervous about needles",
                sensitive: true,
                source: "BOOKING_PAGE",
                status: "SUGGESTED",
            },
        });
        const waiting = await attention.list(owner, contactId);
        expect(waiting.suggestions?.map((s) => s.id)).toEqual([suggestion.id]);
        expect(waiting.entries.map((e) => e.id)).not.toContain(suggestion.id);
        expect(
            (await attention.list(member, contactId)).suggestions,
        ).toBeUndefined();

        const confirmed = await attention.confirm(
            owner,
            contactId,
            suggestion.id,
        );
        expect(confirmed).toMatchObject({
            status: "ACTIVE",
            confirmedByUserId: ownerId,
            source: "BOOKING_PAGE",
        });
        const now = await attention.list(owner, contactId);
        expect(now.entries.map((e) => e.id)).toContain(suggestion.id);
        expect(now.suggestions).toEqual([]);
    });
});
