import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ContactNotesService } from "./contact-notes.service";

/**
 * Notes about a customer (U8): text and allergens from the storefront's own
 * list, written by a role that may change contacts, audited without their
 * words, and scoped to the contact and organization they belong to.
 */

const OWNER: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};

const NOW = new Date("2026-09-23T10:00:00Z");

function noteRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "note_1",
        body: "Prefers the seeded loaf",
        createdByUserId: "user_1",
        createdAt: NOW,
        updatedAt: NOW,
        allergens: [{ allergen: { id: "alg_nuts", name: "Nuts" } }],
        ...overrides,
    };
}

function make() {
    const db = {
        contact: { findFirst: jest.fn().mockResolvedValue({ id: "c1" }) },
        contactNote: {
            create: jest.fn().mockResolvedValue({ id: "note_1" }),
            update: jest.fn().mockResolvedValue({}),
            delete: jest.fn().mockResolvedValue({}),
            findFirst: jest.fn().mockResolvedValue(noteRow()),
        },
        contactNoteAllergen: {
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        storeAllergen: { count: jest.fn().mockResolvedValue(1) },
        auditEvent: { create: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(db)),
    };
    return { svc: new ContactNotesService(db as never), db };
}

describe("ContactNotesService", () => {
    it("writes a note with its allergens and audits it without the text", async () => {
        const { svc, db } = make();

        const note = await svc.create(OWNER, "c1", {
            body: "Severe nut allergy",
            allergenIds: ["alg_nuts", "alg_nuts"],
        });

        expect(db.contactNote.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    organizationId: "org_1",
                    contactId: "c1",
                    body: "Severe nut allergy",
                    createdByUserId: "user_1",
                }),
            }),
        );
        // Duplicates collapse to one allergen.
        expect(db.contactNoteAllergen.createMany).toHaveBeenCalledWith({
            data: [
                {
                    noteId: "note_1",
                    allergenId: "alg_nuts",
                    organizationId: "org_1",
                },
            ],
        });
        const audit = db.auditEvent.create.mock.calls[0][0].data;
        expect(audit.action).toBe("contact.note.created");
        expect(JSON.stringify(audit)).not.toContain("nut allergy");
        expect(note.allergens).toEqual([{ id: "alg_nuts", name: "Nuts" }]);
    });

    it("refuses an allergen that is not on the organization's list", async () => {
        const { svc, db } = make();
        db.storeAllergen.count.mockResolvedValue(0);

        const refusal = await svc
            .create(OWNER, "c1", { allergenIds: ["alg_elsewhere"] })
            .catch((e: unknown) => e);

        expect(refusal).toBeInstanceOf(BadRequestException);
        expect((refusal as BadRequestException).getResponse()).toEqual(
            expect.objectContaining({ field: "allergenIds" }),
        );
        expect(db.storeAllergen.count).toHaveBeenCalledWith({
            where: { organizationId: "org_1", id: { in: ["alg_elsewhere"] } },
        });
        expect(db.contactNote.create).not.toHaveBeenCalled();
    });

    it("refuses a note with neither text nor an allergen", async () => {
        const { svc, db } = make();

        const refusal = await svc
            .create(OWNER, "c1", { body: "", allergenIds: [] })
            .catch((e: unknown) => e);

        expect(refusal).toBeInstanceOf(BadRequestException);
        expect((refusal as BadRequestException).getResponse()).toEqual({
            message: "Write a note or pick an allergen.",
            field: "body",
        });
        expect(db.contactNote.create).not.toHaveBeenCalled();
    });

    it("refuses a Member", async () => {
        const { svc, db } = make();

        await expect(
            svc.create({ ...OWNER, role: "MEMBER" }, "c1", { body: "Hi" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            svc.remove({ ...OWNER, role: "MEMBER" }, "c1", "note_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(db.contactNote.create).not.toHaveBeenCalled();
        expect(db.contactNote.delete).not.toHaveBeenCalled();
    });

    it("is a 404 for a contact in another organization", async () => {
        const { svc, db } = make();
        db.contact.findFirst.mockResolvedValue(null);

        await expect(
            svc.create(OWNER, "c_other", { body: "Hi" }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("keeps the allergens when an update leaves them out", async () => {
        const { svc, db } = make();

        await svc.update(OWNER, "c1", "note_1", { body: "Now oat milk too" });

        expect(db.contactNote.update).toHaveBeenCalledWith({
            where: { id: "note_1" },
            data: { body: "Now oat milk too", updatedByUserId: "user_1" },
        });
        expect(db.contactNoteAllergen.deleteMany).not.toHaveBeenCalled();
        expect(db.storeAllergen.count).not.toHaveBeenCalled();
    });

    it("replaces the allergens when an update names them", async () => {
        const { svc, db } = make();
        db.storeAllergen.count.mockResolvedValue(2);

        await svc.update(OWNER, "c1", "note_1", {
            allergenIds: ["alg_milk", "alg_eggs"],
        });

        expect(db.contactNoteAllergen.deleteMany).toHaveBeenCalledWith({
            where: { noteId: "note_1" },
        });
        expect(db.contactNoteAllergen.createMany).toHaveBeenCalledWith({
            data: [
                {
                    noteId: "note_1",
                    allergenId: "alg_milk",
                    organizationId: "org_1",
                },
                {
                    noteId: "note_1",
                    allergenId: "alg_eggs",
                    organizationId: "org_1",
                },
            ],
        });
    });

    it("refuses an update that would leave the note empty", async () => {
        const { svc, db } = make();
        db.contactNote.findFirst.mockResolvedValue(noteRow({ allergens: [] }));

        await expect(
            svc.update(OWNER, "c1", "note_1", { body: "  " }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(db.contactNote.update).not.toHaveBeenCalled();
    });

    it("finds a note only under its own contact and organization", async () => {
        const { svc, db } = make();
        db.contactNote.findFirst.mockResolvedValue(null);

        await expect(svc.remove(OWNER, "c2", "note_1")).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(db.contactNote.findFirst.mock.calls[0][0].where).toEqual({
            id: "note_1",
            contactId: "c2",
            organizationId: "org_1",
        });
        expect(db.contactNote.delete).not.toHaveBeenCalled();
    });
});
