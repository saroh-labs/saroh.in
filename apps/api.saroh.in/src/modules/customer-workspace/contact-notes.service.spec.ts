import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ContactNotesService, loadContactNotes } from "./contact-notes.service";

/**
 * Notes about a customer (U8): text only since Z2a, written by a role that
 * may change contacts, audited without their words, and scoped to the
 * contact and organization they belong to. Allergens live on Needs attention
 * (C1); `ContactNoteAllergen` is never read or written.
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
            findMany: jest.fn().mockResolvedValue([noteRow()]),
        },
        // Present only so a test can say nothing touches it (Z2a).
        contactNoteAllergen: {
            createMany: jest.fn(),
            deleteMany: jest.fn(),
            findMany: jest.fn(),
        },
        storeAllergen: {
            count: jest.fn().mockResolvedValue(1),
            findMany: jest
                .fn()
                .mockImplementation(
                    ({ where }: { where: { id?: { in: string[] } } }) =>
                        Promise.resolve(
                            [
                                { id: "alg_nuts", name: "Nuts" },
                                { id: "alg_sesame", name: "Sesame" },
                                { id: "alg_nuts_stall", name: " nuts " },
                            ].filter(
                                (r) => !where.id || where.id.in.includes(r.id),
                            ),
                        ),
                ),
        },
        // Needs attention (C1): the person has no Allergy entry yet.
        contactAttention: {
            findMany: jest.fn().mockResolvedValue([]),
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        user: {
            findMany: jest
                .fn()
                .mockResolvedValue([{ id: "user_1", name: "Nisha" }]),
        },
        auditEvent: { create: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(db)),
    };
    return { svc: new ContactNotesService(db as never), db };
}

function untouched(db: ReturnType<typeof make>["db"]) {
    expect(db.contactNoteAllergen.createMany).not.toHaveBeenCalled();
    expect(db.contactNoteAllergen.deleteMany).not.toHaveBeenCalled();
    expect(db.contactNoteAllergen.findMany).not.toHaveBeenCalled();
}

describe("ContactNotesService", () => {
    it("writes a note's text and audits it without the words", async () => {
        const { svc, db } = make();

        const note = await svc.create(OWNER, "c1", {
            body: "Collects on Saturdays",
        });

        expect(db.contactNote.create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                contactId: "c1",
                body: "Collects on Saturdays",
                createdByUserId: "user_1",
                updatedByUserId: "user_1",
            },
            select: { id: true },
        });
        const audit = db.auditEvent.create.mock.calls[0][0].data;
        expect(audit.action).toBe("contact.note.created");
        expect(JSON.stringify(audit)).not.toContain("Saturdays");
        expect(note.author).toBe("Nisha");
        untouched(db);
    });

    it("saves text only when the payload names allergens (Z2a)", async () => {
        const { svc, db } = make();

        const note = await svc.create(OWNER, "c1", {
            body: "Severe nut allergy",
            allergenIds: ["alg_nuts", "alg_nuts"],
        });

        expect(db.contactNote.create.mock.calls[0][0].data).not.toHaveProperty(
            "allergens",
        );
        untouched(db);
        // The view keeps its old fields for an app from before Z2a, empty.
        expect(note.allergens).toEqual([]);
        expect(note.matchAllergens).toEqual([]);
        // Read without the join the table used to give it.
        expect(db.contactNote.findFirst.mock.calls[0][0].select).toEqual({
            id: true,
            body: true,
            createdByUserId: true,
            createdAt: true,
            updatedAt: true,
        });
    });

    it("puts allergens an older app sends on Needs attention, once per name", async () => {
        const { svc, db } = make();

        await svc.create(OWNER, "c1", {
            body: "Nut allergy",
            allergenIds: ["alg_nuts", "alg_nuts_stall", "alg_sesame"],
        });

        expect(db.contactAttention.createMany).toHaveBeenCalledWith({
            data: [
                expect.objectContaining({
                    organizationId: "org_1",
                    contactId: "c1",
                    kind: "ALLERGY",
                    label: "Nuts",
                    allergenId: "alg_nuts",
                    sensitive: false,
                    source: "STAFF",
                    status: "ACTIVE",
                    createdByUserId: "user_1",
                }),
                expect.objectContaining({
                    label: "Sesame",
                    allergenId: "alg_sesame",
                }),
            ],
        });
        untouched(db);
    });

    it("adds no second entry for an allergy already on Needs attention", async () => {
        const { svc, db } = make();
        db.contactAttention.findMany.mockResolvedValue([
            { label: "Nuts", allergen: { name: "NUTS" } },
        ]);

        await svc.create(OWNER, "c1", {
            body: "Nuts",
            allergenIds: ["alg_nuts"],
        });

        expect(db.contactAttention.createMany).not.toHaveBeenCalled();
    });

    it("skips an allergen that is not on the organization's list", async () => {
        const { svc, db } = make();

        await svc.create(OWNER, "c1", {
            body: "Hi",
            allergenIds: ["alg_elsewhere"],
        });

        expect(db.storeAllergen.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_1",
                    id: { in: ["alg_elsewhere"] },
                },
            }),
        );
        expect(db.contactAttention.createMany).not.toHaveBeenCalled();
        expect(db.contactNote.create).toHaveBeenCalled();
    });

    it("leaves Needs attention alone when no allergens are sent", async () => {
        const { svc, db } = make();

        await svc.create(OWNER, "c1", { body: "Oat milk" });
        await svc.update(OWNER, "c1", "note_1", { body: "Now oat milk" });

        expect(db.contactAttention.findMany).not.toHaveBeenCalled();
        expect(db.contactAttention.createMany).not.toHaveBeenCalled();
        expect(db.storeAllergen.findMany).not.toHaveBeenCalled();
    });

    it("refuses a note with no text, even with allergens", async () => {
        const { svc, db } = make();

        for (const dto of [
            { body: "" },
            { body: "   ", allergenIds: [] },
            { allergenIds: ["alg_nuts"] },
        ]) {
            const refusal = await svc
                .create(OWNER, "c1", dto)
                .catch((e: unknown) => e);
            expect(refusal).toBeInstanceOf(BadRequestException);
            expect((refusal as BadRequestException).getResponse()).toEqual({
                message: "Write a note.",
                field: "body",
            });
        }
        expect(db.contactNote.create).not.toHaveBeenCalled();
        expect(db.contactAttention.createMany).not.toHaveBeenCalled();
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

    it("updates the text, and ignores allergens for the note", async () => {
        const { svc, db } = make();

        await svc.update(OWNER, "c1", "note_1", {
            body: "Now oat milk too",
            allergenIds: ["alg_sesame"],
        });

        expect(db.contactNote.update).toHaveBeenCalledWith({
            where: { id: "note_1" },
            data: { body: "Now oat milk too", updatedByUserId: "user_1" },
        });
        untouched(db);
    });

    it("keeps the text when an update leaves it out", async () => {
        const { svc, db } = make();

        await svc.update(OWNER, "c1", "note_1", {});

        expect(db.contactNote.update).toHaveBeenCalledWith({
            where: { id: "note_1" },
            data: {
                body: "Prefers the seeded loaf",
                updatedByUserId: "user_1",
            },
        });
    });

    it("refuses an update that would leave the note empty", async () => {
        const { svc, db } = make();

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

    describe("loadContactNotes", () => {
        it("lists notes with text, newest first, with no allergens", async () => {
            const { db } = make();

            const notes = await loadContactNotes(db as never, "org_1", "c1");

            expect(db.contactNote.findMany).toHaveBeenCalledWith({
                // A note that held only allergens has no text: left out.
                where: {
                    organizationId: "org_1",
                    contactId: "c1",
                    body: { not: "" },
                },
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    body: true,
                    createdByUserId: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
            expect(notes).toEqual([
                expect.objectContaining({
                    id: "note_1",
                    body: "Prefers the seeded loaf",
                    allergens: [],
                    matchAllergens: [],
                    author: "Nisha",
                }),
            ]);
            untouched(db);
            expect(db.storeAllergen.findMany).not.toHaveBeenCalled();
        });
    });
});
