/**
 * Needs attention (DEC-040, C1) against a real Postgres: sensitive entries
 * reach only who may read them, Allergy entries name the business's own
 * allergens, the backfill turns note allergens into entries once, and Order
 * Detail's allergy banner — which reads the notes — is unchanged by it.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { backfillContactAttention, prisma } from "@saroh/database";

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

/** What Order Detail's banner is built from (lib/orders/lifecycle.ts). */
function bannerInput(
    rows: {
        body: string;
        allergens: { id: string }[];
        matchAllergens: { id: string }[];
    }[],
) {
    return rows
        .filter((n) => n.allergens.length > 0)
        .map((n) => ({
            body: n.body,
            allergens: (n.matchAllergens.length
                ? n.matchAllergens
                : n.allergens
            )
                .map((a) => a.id)
                .sort(),
        }));
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
        ).rejects.toThrow(/may not perform "contact:write"/);

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

    it("turns note allergens into Allergy entries once, and the banner reads the same", async () => {
        // Clean slate for this contact's allergies.
        await prisma.contactAttention.deleteMany({ where: { contactId } });

        // Notes as they were before C1: written straight to the tables.
        const older = await prisma.contactNote.create({
            data: {
                organizationId: owner.organizationId,
                contactId,
                body: "Sesame allergy",
                createdByUserId: ownerId,
                createdAt: new Date("2026-09-01T09:00:00Z"),
            },
        });
        const newer = await prisma.contactNote.create({
            data: {
                organizationId: owner.organizationId,
                contactId,
                body: "Also peanuts — carries an EpiPen",
                createdAt: new Date("2026-09-10T09:00:00Z"),
            },
        });
        await prisma.contactNoteAllergen.createMany({
            data: [
                {
                    noteId: older.id,
                    allergenId: sesameId,
                    organizationId: owner.organizationId,
                },
                {
                    noteId: newer.id,
                    allergenId: peanutsId,
                    organizationId: owner.organizationId,
                },
                {
                    noteId: newer.id,
                    allergenId: sesameId,
                    organizationId: owner.organizationId,
                },
            ],
        });

        // Pin the banner's input before.
        const before = await details.detail(member, contactId);
        const pinned = bannerInput(before.notes?.rows ?? []);
        expect(pinned).toHaveLength(2);

        const first = await backfillContactAttention(prisma);
        expect(first.created).toBeGreaterThanOrEqual(2);
        const entries = await prisma.contactAttention.findMany({
            where: { contactId, removedAt: null },
            orderBy: { label: "asc" },
        });
        expect(
            entries.map((e) => ({
                kind: e.kind,
                label: e.label,
                allergenId: e.allergenId,
                sensitive: e.sensitive,
                source: e.source,
                status: e.status,
            })),
        ).toEqual([
            {
                kind: "ALLERGY",
                label: "Peanuts",
                allergenId: peanutsId,
                sensitive: false,
                source: "STAFF",
                status: "ACTIVE",
            },
            {
                kind: "ALLERGY",
                label: "Sesame",
                allergenId: sesameId,
                sensitive: false,
                source: "STAFF",
                status: "ACTIVE",
            },
        ]);
        // Added by the oldest note's author, at its time.
        const sesame = entries.find((e) => e.label === "Sesame");
        expect(sesame?.createdByUserId).toBe(ownerId);
        expect(sesame?.createdAt.toISOString()).toBe(
            "2026-09-01T09:00:00.000Z",
        );

        // Run twice: nothing changes.
        const second = await backfillContactAttention(prisma);
        expect(second.created).toBe(0);
        expect(
            await prisma.contactAttention.count({ where: { contactId } }),
        ).toBe(2);

        // An entry the team takes off doesn't come back on a later run.
        await attention.remove(owner, contactId, sesame!.id);
        expect((await backfillContactAttention(prisma)).created).toBe(0);

        // Order Detail's banner input is exactly what it was, and the
        // entries a Member reads cover the notes' allergens.
        const after = await details.detail(member, contactId);
        expect(bannerInput(after.notes?.rows ?? [])).toEqual(pinned);
        expect(after.allergens).toEqual(before.allergens);
        expect(after.attention?.entries.map((e) => e.allergen?.id)).toEqual([
            peanutsId,
        ]);
    });

    it("puts a new note's allergen on Needs attention too, for one release", async () => {
        await prisma.contactAttention.deleteMany({ where: { contactId } });

        await notes.create(owner, contactId, {
            body: "Sesame, badly",
            allergenIds: [sesameId],
        });
        await notes.create(owner, contactId, { allergenIds: [sesameId] });

        const read = await attention.list(owner, contactId);
        expect(
            read.entries.map((e) => [e.kind, e.label, e.allergen?.id]),
        ).toEqual([["ALLERGY", "Sesame", sesameId]]);
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
