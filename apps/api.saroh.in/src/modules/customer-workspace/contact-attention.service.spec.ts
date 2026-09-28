import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ContactAttentionService } from "./contact-attention.service";

/**
 * Needs attention, written (DEC-040, C1): who may write, the Allergy rules
 * against the business's allergen list, the sensitive default for Medical,
 * one entry per allergen name, soft removal, confirming a suggestion, and an
 * audit that never carries the words.
 */

const OWNER: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};
const ADMIN: OrganizationContext = { ...OWNER, role: "ADMIN" };
const MEMBER: OrganizationContext = { ...OWNER, role: "MEMBER" };

const NOW = new Date("2026-09-27T10:00:00Z");

function entry(over: Record<string, unknown> = {}) {
    return {
        id: "att_1",
        contactId: "c1",
        kind: "MEDICAL",
        label: "Blood thinners",
        detail: null,
        sensitive: true,
        source: "STAFF",
        status: "ACTIVE",
        bookingId: null,
        createdByUserId: "user_1",
        confirmedByUserId: null,
        createdAt: NOW,
        updatedAt: NOW,
        allergen: null,
        ...over,
    };
}

function make() {
    let stored = entry();
    const db = {
        contact: { findFirst: jest.fn().mockResolvedValue({ id: "c1" }) },
        contactAttention: {
            create: jest.fn().mockImplementation(({ data }) => {
                stored = entry({
                    ...data,
                    allergen: data.allergenId
                        ? { id: data.allergenId, name: "Sesame" }
                        : null,
                });
                return Promise.resolve({ id: "att_1" });
            }),
            update: jest.fn().mockImplementation(({ data }) => {
                stored = { ...stored, ...data };
                return Promise.resolve({});
            }),
            // A guarded write: only a suggestion still waiting changes.
            updateMany: jest.fn().mockImplementation(({ where, data }) => {
                if (
                    stored.status !== where.status ||
                    (stored as { removedAt?: Date | null }).removedAt
                ) {
                    return Promise.resolve({ count: 0 });
                }
                const { allergenId, ...rest } = data;
                stored = {
                    ...stored,
                    ...rest,
                    allergen: allergenId
                        ? { id: allergenId, name: "Sesame" }
                        : null,
                };
                return Promise.resolve({ count: 1 });
            }),
            findFirst: jest
                .fn()
                .mockImplementation(() => Promise.resolve(stored)),
            // Other Allergy entries on the record.
            findMany: jest.fn().mockResolvedValue([]),
            groupBy: jest.fn().mockResolvedValue([]),
        },
        storeAllergen: {
            findFirst: jest.fn().mockResolvedValue({
                id: "alg_sesame",
                name: "Sesame ",
            }),
            count: jest.fn().mockResolvedValue(3),
            findMany: jest
                .fn()
                .mockResolvedValue([{ id: "alg_sesame", name: "Sesame" }]),
        },
        user: {
            findMany: jest
                .fn()
                .mockResolvedValue([{ id: "user_1", name: "Nisha" }]),
        },
        auditEvent: { create: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(db)),
    };
    const setStored = (over: Record<string, unknown>) => {
        stored = entry(over);
    };
    return { svc: new ContactAttentionService(db as never), db, setStored };
}

const reason = (e: unknown) =>
    (e as BadRequestException).getResponse() as { field?: string };

describe("ContactAttentionService", () => {
    describe("adding", () => {
        it("makes Medical sensitive by default, and audits it without the words", async () => {
            const { svc, db } = make();

            const made = await svc.create(OWNER, "c1", {
                kind: "MEDICAL",
                label: "Blood thinners",
                detail: "Warfarin, 5mg",
            });

            expect(db.contactAttention.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        organizationId: "org_1",
                        contactId: "c1",
                        kind: "MEDICAL",
                        label: "Blood thinners",
                        detail: "Warfarin, 5mg",
                        sensitive: true,
                        allergenId: null,
                        source: "STAFF",
                        status: "ACTIVE",
                        createdByUserId: "user_1",
                    }),
                }),
            );
            expect(made).toMatchObject({ sensitive: true, addedBy: "Nisha" });
            const audit = db.auditEvent.create.mock.calls[0][0].data;
            expect(audit).toMatchObject({
                action: "contact.attention.created",
                targetType: "contactAttention",
                metadata: {
                    contactId: "c1",
                    kind: "MEDICAL",
                    sensitive: "yes",
                },
            });
            expect(JSON.stringify(audit)).not.toMatch(/thinners|Warfarin/);
        });

        it("lets staff untick sensitive on a Medical entry, and leaves the rest open", async () => {
            const { svc, db } = make();

            await svc.create(OWNER, "c1", {
                kind: "MEDICAL",
                label: "Pregnant",
                sensitive: false,
            });
            await svc.create(OWNER, "c1", {
                kind: "ACCESS",
                label: "Uses a wheelchair",
            });

            const made = db.contactAttention.create.mock.calls.map(
                (c) => c[0].data.sensitive,
            );
            expect(made).toEqual([false, false]);
        });

        it("refuses a Member, who cannot change a contact", async () => {
            const { svc, db } = make();

            await expect(
                svc.create(MEMBER, "c1", { kind: "OTHER", label: "VIP" }),
            ).rejects.toBeInstanceOf(ForbiddenException);
            expect(db.contactAttention.create).not.toHaveBeenCalled();
        });

        it("is a 404 for a contact in another organization", async () => {
            const { svc, db } = make();
            db.contact.findFirst.mockResolvedValue(null);

            await expect(
                svc.create(OWNER, "c_elsewhere", { kind: "OTHER", label: "x" }),
            ).rejects.toBeInstanceOf(NotFoundException);
            expect(db.contact.findFirst).toHaveBeenCalledWith({
                where: { id: "c_elsewhere", organizationId: "org_1" },
                select: { id: true },
            });
        });

        it("needs a label", async () => {
            const { svc } = make();

            const e = await svc
                .create(OWNER, "c1", { kind: "ACCESS", label: "" })
                .catch((x: unknown) => x);
            expect(e).toBeInstanceOf(BadRequestException);
            expect(reason(e).field).toBe("label");
        });

        it("refuses an allergen on anything but an allergy", async () => {
            const { svc } = make();

            const e = await svc
                .create(OWNER, "c1", {
                    kind: "OTHER",
                    label: "Likes sesame",
                    allergenId: "alg_sesame",
                })
                .catch((x: unknown) => x);
            expect(e).toBeInstanceOf(BadRequestException);
            expect(reason(e).field).toBe("allergenId");
        });
    });

    describe("allergies", () => {
        it("names an allergen from the list, labelled with its name", async () => {
            const { svc, db } = make();

            const made = await svc.create(OWNER, "c1", {
                kind: "ALLERGY",
                allergenId: "alg_sesame",
            });

            expect(db.storeAllergen.findFirst).toHaveBeenCalledWith({
                where: { id: "alg_sesame", organizationId: "org_1" },
                select: { id: true, name: true },
            });
            expect(
                db.contactAttention.create.mock.calls[0][0].data,
            ).toMatchObject({
                kind: "ALLERGY",
                label: "Sesame",
                allergenId: "alg_sesame",
                sensitive: false,
            });
            expect(made.matchAllergens).toEqual([
                { id: "alg_sesame", name: "Sesame" },
            ]);
        });

        it("is a 404 for another business's allergen", async () => {
            const { svc, db } = make();
            db.storeAllergen.findFirst.mockResolvedValue(null);

            await expect(
                svc.create(OWNER, "c1", {
                    kind: "ALLERGY",
                    allergenId: "alg_elsewhere",
                }),
            ).rejects.toBeInstanceOf(NotFoundException);
            expect(db.contactAttention.create).not.toHaveBeenCalled();
        });

        it("asks for the allergen when the business has a list", async () => {
            const { svc } = make();

            const e = await svc
                .create(OWNER, "c1", { kind: "ALLERGY", label: "Sesame" })
                .catch((x: unknown) => x);
            expect(e).toBeInstanceOf(BadRequestException);
            expect(reason(e).field).toBe("allergenId");
        });

        it("takes the allergy as its label when the business has no list", async () => {
            const { svc, db } = make();
            db.storeAllergen.count.mockResolvedValue(0);

            await svc.create(OWNER, "c1", { kind: "ALLERGY", label: "Latex" });

            expect(
                db.contactAttention.create.mock.calls[0][0].data,
            ).toMatchObject({
                kind: "ALLERGY",
                label: "Latex",
                allergenId: null,
            });
        });

        it("refuses a second entry for an allergy already on the list", async () => {
            const { svc, db } = make();
            db.contactAttention.findMany.mockResolvedValue([
                { label: "Sesame", allergen: { name: "sesame" } },
            ]);

            await expect(
                svc.create(OWNER, "c1", {
                    kind: "ALLERGY",
                    allergenId: "alg_sesame",
                }),
            ).rejects.toBeInstanceOf(ConflictException);
            expect(db.contactAttention.create).not.toHaveBeenCalled();
        });
    });

    describe("changing", () => {
        it("lets an Admin edit a sensitive entry, keeping fields not given", async () => {
            const { svc, db } = make();

            const changed = await svc.update(ADMIN, "c1", "att_1", {
                detail: "Stopped in August",
            });

            expect(db.contactAttention.update).toHaveBeenCalledWith({
                where: { id: "att_1" },
                data: {
                    kind: "MEDICAL",
                    label: "Blood thinners",
                    detail: "Stopped in August",
                    sensitive: true,
                    allergenId: null,
                },
            });
            expect(changed.detail).toBe("Stopped in August");
        });

        it("clears the detail on a blank one", async () => {
            const { svc, db } = make();

            await svc.update(OWNER, "c1", "att_1", { detail: null });

            expect(
                db.contactAttention.update.mock.calls[0][0].data.detail,
            ).toBe(null);
        });

        it("refuses a Member", async () => {
            const { svc, db } = make();

            await expect(
                svc.update(MEMBER, "c1", "att_1", { label: "x" }),
            ).rejects.toBeInstanceOf(ForbiddenException);
            expect(db.contactAttention.update).not.toHaveBeenCalled();
        });

        it("finds an entry only under its own contact and organization, not removed", async () => {
            const { svc, db } = make();
            db.contactAttention.findFirst.mockResolvedValue(null);

            await expect(
                svc.update(OWNER, "c2", "att_1", { label: "x" }),
            ).rejects.toBeInstanceOf(NotFoundException);
            expect(
                db.contactAttention.findFirst.mock.calls[0][0].where,
            ).toEqual({
                id: "att_1",
                contactId: "c2",
                organizationId: "org_1",
                removedAt: null,
            });
        });

        it("drops the allergen when an allergy becomes another kind", async () => {
            const { svc, db, setStored } = make();
            setStored({
                kind: "ALLERGY",
                label: "Sesame",
                sensitive: false,
                allergen: { id: "alg_sesame", name: "Sesame" },
            });

            await svc.update(OWNER, "c1", "att_1", {
                kind: "OTHER",
                label: "Avoids sesame",
            });

            expect(
                db.contactAttention.update.mock.calls[0][0].data,
            ).toMatchObject({ kind: "OTHER", allergenId: null });
        });

        it("doesn't count an allergy as its own duplicate", async () => {
            const { svc, db, setStored } = make();
            setStored({
                kind: "ALLERGY",
                label: "Sesame",
                sensitive: false,
                allergen: { id: "alg_sesame", name: "Sesame" },
            });

            await svc.update(OWNER, "c1", "att_1", { detail: "Severe" });

            expect(db.contactAttention.findMany.mock.calls[0][0].where).toEqual(
                expect.objectContaining({ id: { not: "att_1" } }),
            );
        });
    });

    describe("removing and suggestions", () => {
        it("takes an entry off by stamping it, never deleting the row", async () => {
            const { svc, db } = make();

            await svc.remove(OWNER, "c1", "att_1");

            expect(db.contactAttention.update).toHaveBeenCalledWith({
                where: { id: "att_1" },
                data: { removedAt: expect.any(Date) },
            });
            expect(db.auditEvent.create.mock.calls[0][0].data.action).toBe(
                "contact.attention.removed",
            );
        });

        it("records Nothing to add on a suggestion as dismissed", async () => {
            const { svc, db, setStored } = make();
            setStored({ status: "SUGGESTED", source: "BOOKING_PAGE" });

            await svc.remove(OWNER, "c1", "att_1");

            expect(db.auditEvent.create.mock.calls[0][0].data.action).toBe(
                "contact.attention.dismissed",
            );
        });

        it("puts a suggestion on the record with who confirmed it", async () => {
            const { svc, db, setStored } = make();
            setStored({
                status: "SUGGESTED",
                source: "BOOKING_PAGE",
                createdByUserId: null,
            });

            const confirmed = await svc.confirm(ADMIN, "c1", "att_1");

            expect(db.contactAttention.updateMany).toHaveBeenCalledWith({
                where: {
                    id: "att_1",
                    organizationId: "org_1",
                    status: "SUGGESTED",
                    removedAt: null,
                },
                data: {
                    kind: "MEDICAL",
                    label: "Blood thinners",
                    detail: null,
                    sensitive: true,
                    allergenId: null,
                    status: "ACTIVE",
                    confirmedByUserId: "user_1",
                },
            });
            expect(confirmed.status).toBe("ACTIVE");
        });

        it("answers a second confirm with the entry as it is", async () => {
            const { svc, db } = make();

            const again = await svc.confirm(OWNER, "c1", "att_1");

            expect(again.status).toBe("ACTIVE");
            expect(db.contactAttention.update).not.toHaveBeenCalled();
            expect(db.contactAttention.updateMany).not.toHaveBeenCalled();
        });

        it("refuses a Member confirming or removing", async () => {
            const { svc } = make();

            await expect(
                svc.confirm(MEMBER, "c1", "att_1"),
            ).rejects.toBeInstanceOf(ForbiddenException);
            await expect(
                svc.remove(MEMBER, "c1", "att_1"),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });
    });

    describe("booking-page notes (C12)", () => {
        const RAHUL = {
            status: "SUGGESTED",
            source: "BOOKING_PAGE",
            kind: "MEDICAL",
            label: "I take amlodipine 5mg for blood pressure",
            detail: "I take amlodipine 5mg for blood pressure. Please check before the numbing.",
            sensitive: true,
            bookingId: "bk_1",
            createdByUserId: null,
        };

        it("adds Rahul's note as a Medical tag with the label staff wrote, sensitive, keeping his words", async () => {
            const { svc, db, setStored } = make();
            setStored(RAHUL);

            const added = await svc.confirm(OWNER, "c1", "att_1", {
                kind: "MEDICAL",
                label: "Takes amlodipine",
                sensitive: true,
            });

            expect(
                db.contactAttention.updateMany.mock.calls[0][0].data,
            ).toEqual({
                kind: "MEDICAL",
                label: "Takes amlodipine",
                detail: RAHUL.detail,
                sensitive: true,
                allergenId: null,
                status: "ACTIVE",
                confirmedByUserId: "user_1",
            });
            expect(added).toMatchObject({
                kind: "MEDICAL",
                label: "Takes amlodipine",
                sensitive: true,
                status: "ACTIVE",
                source: "BOOKING_PAGE",
                bookingId: "bk_1",
            });
            // Activity says what kind, never the words.
            const audit = db.auditEvent.create.mock.calls[0][0].data;
            expect(audit).toMatchObject({
                action: "contact.attention.confirmed",
                metadata: {
                    contactId: "c1",
                    kind: "MEDICAL",
                    sensitive: "yes",
                },
            });
            expect(JSON.stringify(audit)).not.toContain("amlodipine");
        });

        it("adds it as another kind, not sensitive, when staff untick it", async () => {
            const { svc, db, setStored } = make();
            setStored({ ...RAHUL, label: "Uses a wheelchair" });

            const added = await svc.confirm(OWNER, "c1", "att_1", {
                kind: "ACCESS",
                sensitive: false,
            });

            expect(added).toMatchObject({
                kind: "ACCESS",
                label: "Uses a wheelchair",
                sensitive: false,
            });
            expect(
                db.auditEvent.create.mock.calls[0][0].data.metadata,
            ).toMatchObject({ kind: "ACCESS", sensitive: "no" });
        });

        it("adds it as it stands when the old app confirms with no body", async () => {
            const { svc, setStored } = make();
            setStored(RAHUL);

            const added = await svc.confirm(OWNER, "c1", "att_1");

            expect(added).toMatchObject({
                kind: "MEDICAL",
                label: RAHUL.label,
                sensitive: true,
            });
        });

        it("needs a label", async () => {
            const { svc, db, setStored } = make();
            setStored(RAHUL);

            const err = await svc
                .confirm(OWNER, "c1", "att_1", { label: "  " })
                .catch((e: unknown) => e);

            expect(err).toBeInstanceOf(BadRequestException);
            expect(reason(err).field).toBe("label");
            expect(db.contactAttention.updateMany).not.toHaveBeenCalled();
        });

        it("asks for the allergen from the list when added as an Allergy, and takes one", async () => {
            const { svc, db, setStored } = make();
            setStored({ ...RAHUL, label: "Allergic to sesame" });

            const err = await svc
                .confirm(OWNER, "c1", "att_1", { kind: "ALLERGY" })
                .catch((e: unknown) => e);
            expect(err).toBeInstanceOf(BadRequestException);
            expect(reason(err).field).toBe("allergenId");

            const added = await svc.confirm(OWNER, "c1", "att_1", {
                kind: "ALLERGY",
                label: "",
                allergenId: "alg_sesame",
                sensitive: false,
            });
            expect(
                db.contactAttention.updateMany.mock.calls[0][0].data,
            ).toMatchObject({
                kind: "ALLERGY",
                label: "Sesame",
                allergenId: "alg_sesame",
                sensitive: false,
            });
            expect(added.allergen).toEqual({
                id: "alg_sesame",
                name: "Sesame",
            });
        });

        it("refuses an allergy already on their list", async () => {
            const { svc, db, setStored } = make();
            setStored(RAHUL);
            db.contactAttention.findMany.mockResolvedValue([
                { label: "Sesame", allergen: { name: "Sesame" } },
            ]);

            await expect(
                svc.confirm(OWNER, "c1", "att_1", {
                    kind: "ALLERGY",
                    allergenId: "alg_sesame",
                }),
            ).rejects.toBeInstanceOf(ConflictException);
        });

        it("refuses a Member, who never sees the note", async () => {
            const { svc, db, setStored } = make();
            setStored(RAHUL);

            await expect(
                svc.confirm(MEMBER, "c1", "att_1", {
                    label: "Takes amlodipine",
                }),
            ).rejects.toBeInstanceOf(ForbiddenException);
            expect(db.contactAttention.findFirst).not.toHaveBeenCalled();
        });

        it("adds nothing when a teammate set it aside first, and audits nothing", async () => {
            const { svc, db, setStored } = make();
            setStored(RAHUL);
            // Read as waiting, then set aside before the write.
            db.contactAttention.updateMany.mockResolvedValueOnce({ count: 0 });

            await svc.confirm(OWNER, "c1", "att_1", {
                label: "Takes amlodipine",
            });

            expect(db.auditEvent.create).not.toHaveBeenCalled();
        });

        it("Nothing to add sets it aside and leaves the booking alone", async () => {
            const { svc, db, setStored } = make();
            setStored(RAHUL);

            await svc.remove(OWNER, "c1", "att_1");

            expect(db.contactAttention.update).toHaveBeenCalledWith({
                where: { id: "att_1" },
                data: { removedAt: expect.any(Date) },
            });
            expect(db.auditEvent.create.mock.calls[0][0].data).toMatchObject({
                action: "contact.attention.dismissed",
                metadata: { contactId: "c1", kind: "MEDICAL" },
            });
            // Nothing but the entry is written: the booking keeps its note.
            expect(Object.keys(db)).not.toContain("booking");
        });
    });

    describe("reading the list", () => {
        it("gives a Member what they may see and a count, and no suggestions", async () => {
            const { svc, db } = make();
            db.contactAttention.findMany.mockResolvedValue([
                entry({
                    id: "att_2",
                    kind: "ACCESS",
                    label: "Ramp",
                    sensitive: false,
                }),
            ]);
            db.contactAttention.groupBy.mockResolvedValue([
                { contactId: "c1", _count: { _all: 1 } },
            ]);

            const read = await svc.list(MEMBER, "c1");

            expect(read.entries.map((e) => e.label)).toEqual(["Ramp"]);
            expect(read.hiddenSensitiveCount).toBe(1);
            expect(read).not.toHaveProperty("suggestions");
        });

        it("is a 404 for a contact in another organization", async () => {
            const { svc, db } = make();
            db.contact.findFirst.mockResolvedValue(null);

            await expect(svc.list(OWNER, "c_elsewhere")).rejects.toBeInstanceOf(
                NotFoundException,
            );
        });

        it("refuses a role that cannot read contacts", async () => {
            const { svc } = make();

            await expect(
                svc.list({ ...OWNER, actions: new Set() }, "c1"),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });
    });
});
