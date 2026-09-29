/**
 * One read of a customer (U8) against a real Postgres: orders join only
 * through a confirmed link, an unlinked same-email store customer is only a
 * possible match, notes are text only (Z2a), Needs attention's allergen
 * matches the same-named allergen on every storefront, and only Needs
 * attention holds an allergen on the list. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { AllergensService } from "../catalogue/allergens.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { StoresService } from "../stores/stores.service";
import { ContactAttentionService } from "./contact-attention.service";
import { ContactNotesService } from "./contact-notes.service";
import { CustomerDetailService } from "./customer-detail.service";
import { CustomerWorkspaceService } from "./customer-workspace.service";

const tag = `${process.pid}-${Date.now()}`;

const ids = (list: { id: string }[] | undefined) =>
    (list ?? []).map((a) => a.id).sort();

const availability = {
    listViews: jest.fn().mockResolvedValue(
        ["CRM", "COMMERCE", "APPOINTMENTS", "PAYMENTS"].map((key) => ({
            key,
            readiness: "ACTIVE",
        })),
    ),
} as unknown as ModuleAvailabilityService;

const stores = new StoresService(new FeatureFlagService());
const allergens = new AllergensService();
const details = new CustomerDetailService(availability);
const notes = new ContactNotesService();
const attention = new ContactAttentionService();
const workspace = new CustomerWorkspaceService(availability);

describe("Customer detail (DB)", () => {
    let ownerId = "";
    let ctx: OrganizationContext;
    let otherOrgId = "";
    let storeId = "";
    let contactId = "";
    let linkedId = "";
    let lookalikeStoreId = "";
    let lookalikeId = "";

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `detail-owner-${tag}@example.com` },
            })
        ).id;
        const org = await prisma.organization.create({
            data: { name: "Rye & Co.", slug: `detail-org-${tag}` },
        });
        ctx = { organizationId: org.id, userId: ownerId, role: "OWNER" };
        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Elsewhere", slug: `detail-other-${tag}` },
            })
        ).id;
        storeId = (
            await stores.createForUser(ownerId, org.id, {
                name: "Rye & Co.",
                slug: `detail-rye-${tag}`,
            })
        ).id;
        contactId = (
            await prisma.contact.create({
                data: {
                    organizationId: org.id,
                    email: "asha@example.com",
                    firstName: "Asha",
                },
            })
        ).id;
        linkedId = (
            await prisma.customer.create({
                data: {
                    storeId,
                    organizationId: org.id,
                    email: "asha.rao@example.com",
                    firstName: "Asha",
                },
            })
        ).id;
        await workspace.link(ctx, contactId, linkedId);
        await prisma.order.create({
            data: {
                storeId,
                organizationId: org.id,
                orderId: `ORD-${tag}-1`,
                customerId: linkedId,
                subtotal: "450",
                total: "450",
                currency: "INR",
                paymentStatus: "PAID",
            },
        });
        // A site checkout never paid: not an order, so not counted.
        await prisma.order.create({
            data: {
                storeId,
                organizationId: org.id,
                orderId: `ORD-${tag}-abandoned`,
                customerId: linkedId,
                subtotal: "90",
                total: "90",
                currency: "INR",
                placedOnline: true,
            },
        });

        // Same email, never linked: a possible match and nothing more.
        lookalikeStoreId = (
            await prisma.store.create({
                data: {
                    name: "Rye Market Stall",
                    slug: `detail-stall-${tag}`,
                    organizationId: org.id,
                },
            })
        ).id;
        lookalikeId = (
            await prisma.customer.create({
                data: {
                    storeId: lookalikeStoreId,
                    organizationId: org.id,
                    email: "ASHA@example.com",
                    firstName: "A.",
                },
            })
        ).id;
        await prisma.order.create({
            data: {
                storeId: lookalikeStoreId,
                organizationId: org.id,
                orderId: `ORD-${tag}-2`,
                customerId: lookalikeId,
                subtotal: "9999",
                total: "9999",
                currency: "INR",
                paymentStatus: "PAID",
            },
        });
    });

    afterAll(async () => {
        const orgIds = [ctx.organizationId, otherOrgId];
        await prisma.contactAttention.deleteMany({
            where: { organizationId: { in: orgIds } },
        });
        await prisma.contactNote.deleteMany({
            where: { organizationId: { in: orgIds } },
        });
        await prisma.order.deleteMany({
            where: { organizationId: { in: orgIds } },
        });
        await prisma.customerIdentityLink.deleteMany({
            where: { organizationId: { in: orgIds } },
        });
        await prisma.customer.deleteMany({
            where: { organizationId: { in: orgIds } },
        });
        await prisma.contact.deleteMany({
            where: { organizationId: { in: orgIds } },
        });
        await prisma.storeAllergen.deleteMany({
            where: { organizationId: { in: orgIds } },
        });
        await prisma.store.deleteMany({
            where: { organizationId: { in: orgIds } },
        });
        await prisma.auditEvent.deleteMany({
            where: { organizationId: { in: orgIds } },
        });
        await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
        await prisma.user.deleteMany({ where: { id: ownerId } });
    });

    it("counts the linked customer's orders and only names the lookalike", async () => {
        const detail = await details.detail(ctx, contactId);

        expect(detail.orders?.rows.map((o) => o.via.customerId)).toEqual([
            linkedId,
        ]);
        expect(detail.stats.orders).toBe(1);
        expect(detail.stats.spent).toEqual([
            { currency: "INR", amount: "450.00" },
        ]);
        expect(detail.possibleMatches).toEqual([
            {
                customerId: lookalikeId,
                name: "A.",
                storefront: { id: lookalikeStoreId, name: "Rye Market Stall" },
            },
        ]);
        expect(detail.unavailable).toEqual([]);
    });

    it("saves a note's text only, and refuses to remove an allergen only for Needs attention (Z2a)", async () => {
        const [nuts] = await allergens.add(ctx.organizationId, ["Nuts"]);

        // An app from before Z2a still sends the allergen with the note.
        const note = await notes.create(ctx, contactId, {
            body: "Severe nut allergy",
            allergenIds: [nuts.id],
        });
        expect(note.body).toBe("Severe nut allergy");
        expect(note.allergens).toEqual([]);
        expect(note.matchAllergens).toEqual([]);
        expect(
            await prisma.contactNoteAllergen.count({
                where: { noteId: note.id },
            }),
        ).toBe(0);

        // The allergen is on Needs attention instead, where the detail's
        // allergens come from.
        const detail = await details.detail(ctx, contactId);
        expect(detail.allergens).toEqual([{ id: nuts.id, name: "Nuts" }]);
        expect(detail.notes?.rows.map((n) => n.allergens)).toEqual([[]]);

        // A note that names it from before Z2a doesn't hold it on the list;
        // the Needs attention entry does.
        await prisma.contactNoteAllergen.create({
            data: {
                noteId: note.id,
                allergenId: nuts.id,
                organizationId: ctx.organizationId,
            },
        });
        await expect(
            allergens.remove(ctx.organizationId, nuts.id),
        ).rejects.toThrow(
            "Nuts is on 1 customer's Needs attention — take it off first.",
        );
        const [entry] = (await attention.list(ctx, contactId)).entries;
        expect(entry).toMatchObject({ kind: "ALLERGY", label: "Nuts" });
        await attention.remove(ctx, contactId, entry.id);
        await expect(
            allergens.remove(ctx.organizationId, nuts.id),
        ).resolves.toEqual({ id: nuts.id, name: "Nuts" });
        // The old row went with it; the note keeps its words.
        expect(
            await prisma.contactNoteAllergen.count({
                where: { allergenId: nuts.id },
            }),
        ).toBe(0);
        expect(
            (await prisma.contactNote.findUnique({ where: { id: note.id } }))
                ?.body,
        ).toBe("Severe nut allergy");

        await notes.remove(ctx, contactId, note.id);
    });

    it("leaves out a note from before Z2a that held only allergens", async () => {
        const [sesame] = await allergens.add(ctx.organizationId, ["Sesame"]);
        const bare = await prisma.contactNote.create({
            data: {
                organizationId: ctx.organizationId,
                contactId,
                body: "",
            },
        });
        await prisma.contactNoteAllergen.create({
            data: {
                noteId: bare.id,
                allergenId: sesame.id,
                organizationId: ctx.organizationId,
            },
        });
        const worded = await notes.create(ctx, contactId, {
            body: "Collects on Saturdays",
        });

        const detail = await details.detail(ctx, contactId);
        expect(detail.notes?.rows.map((n) => n.id)).toEqual([worded.id]);
        // Nothing reads the old row: no allergen, from the notes or anywhere.
        expect(detail.allergens).toEqual([]);

        await prisma.contactNote.delete({ where: { id: bare.id } });
        await notes.remove(ctx, contactId, worded.id);
        await allergens.remove(ctx.organizationId, sesame.id);
    });

    it("matches Needs attention's allergen on every storefront that lists the same name", async () => {
        // Storefronts kept their own lists (#508 R6); until the #529 backfill
        // merges them a business can hold two "Peanuts", and an allergy
        // named against one must still warn on an order that names the other.
        const [peanuts, sesame] = await allergens.add(ctx.organizationId, [
            "Peanuts",
            "Sesame",
        ]);
        const stallPeanuts = await prisma.storeAllergen.create({
            data: {
                storeId: lookalikeStoreId,
                organizationId: ctx.organizationId,
                name: " peanuts ",
            },
        });
        const stallMustard = await prisma.storeAllergen.create({
            data: {
                storeId: lookalikeStoreId,
                organizationId: ctx.organizationId,
                name: "Mustard",
            },
        });

        const entry = await attention.create(ctx, contactId, {
            kind: "ALLERGY",
            allergenId: peanuts.id,
        });
        // An older app naming the stall's Peanuts on a note: still one entry.
        const note = await notes.create(ctx, contactId, {
            body: "Carries an EpiPen",
            allergenIds: [stallPeanuts.id],
        });

        const detail = await details.detail(ctx, contactId);
        expect(detail.allergens).toEqual([{ id: peanuts.id, name: "Peanuts" }]);
        const entries = detail.attention?.entries ?? [];
        expect(entries.map((e) => e.id)).toEqual([entry.id]);
        expect(ids(entries[0].matchAllergens)).toEqual(
            [peanuts.id, stallPeanuts.id].sort(),
        );
        expect(ids(entries[0].matchAllergens)).not.toContain(sesame.id);
        expect(ids(entries[0].matchAllergens)).not.toContain(stallMustard.id);
        expect(detail.notes?.rows.map((n) => n.matchAllergens)).toEqual([[]]);

        await notes.remove(ctx, contactId, note.id);
        await attention.remove(ctx, contactId, entry.id);
    });

    it("saves the note but names nothing from another organization's list", async () => {
        const otherStore = await prisma.store.create({
            data: {
                name: "Elsewhere",
                slug: `detail-elsewhere-${tag}`,
                organizationId: otherOrgId,
            },
        });
        const mustard = await prisma.storeAllergen.create({
            data: {
                storeId: otherStore.id,
                organizationId: otherOrgId,
                name: "Mustard",
            },
        });
        const before = await prisma.contactAttention.count({
            where: { contactId, removedAt: null },
        });

        const note = await notes.create(ctx, contactId, {
            body: "Mustard?",
            allergenIds: [mustard.id],
        });

        expect(note.allergens).toEqual([]);
        expect(
            await prisma.contactAttention.count({
                where: { contactId, removedAt: null },
            }),
        ).toBe(before);
        expect(
            await prisma.contactNoteAllergen.count({
                where: { allergenId: mustard.id },
            }),
        ).toBe(0);
        await notes.remove(ctx, contactId, note.id);
    });
});
