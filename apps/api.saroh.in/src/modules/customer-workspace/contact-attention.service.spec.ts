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

            expect(db.contactAttention.update).toHaveBeenCalledWith({
                where: { id: "att_1" },
                data: { status: "ACTIVE", confirmedByUserId: "user_1" },
            });
            expect(confirmed.status).toBe("ACTIVE");
        });

        it("answers a second confirm with the entry as it is", async () => {
            const { svc, db } = make();

            const again = await svc.confirm(OWNER, "c1", "att_1");

            expect(again.status).toBe("ACTIVE");
            expect(db.contactAttention.update).not.toHaveBeenCalled();
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
