/**
 * One read of a customer (U8) against a real Postgres: orders join only
 * through a confirmed link, an unlinked same-email store customer is only a
 * possible match, notes keep their allergens and match the same-named
 * allergen on every storefront, and an allergen a note names cannot be
 * removed from the list. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { AllergensService } from "../catalogue/allergens.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { StoresService } from "../stores/stores.service";
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
const allergens = new AllergensService(stores);
const details = new CustomerDetailService(availability);
const notes = new ContactNotesService();
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

    it("keeps a note's allergens, and refuses to remove one a note names", async () => {
        const [nuts] = await allergens.add(storeId, ownerId, ["Nuts"]);

        const note = await notes.create(ctx, contactId, {
            body: "Severe nut allergy",
            allergenIds: [nuts.id],
        });
        expect(note.allergens).toEqual([{ id: nuts.id, name: "Nuts" }]);

        const detail = await details.detail(ctx, contactId);
        expect(detail.allergens).toEqual([{ id: nuts.id, name: "Nuts" }]);

        await expect(
            allergens.remove(storeId, nuts.id, ownerId),
        ).rejects.toThrow(
            "Nuts is in 1 customer note — take it off them first.",
        );

        await notes.remove(ctx, contactId, note.id);
        await expect(
            allergens.remove(storeId, nuts.id, ownerId),
        ).resolves.toEqual({ id: nuts.id, name: "Nuts" });
    });

    it("matches a note's allergen on every storefront that lists the same name", async () => {
        // Two storefronts each keep their own "Peanuts" (#508 R6): a note
        // written against the first must still warn on the second's order.
        const [peanuts, sesame] = await allergens.add(storeId, ownerId, [
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

        const note = await notes.create(ctx, contactId, {
            body: "Peanut allergy",
            allergenIds: [peanuts.id],
        });
        expect(note.allergens).toEqual([{ id: peanuts.id, name: "Peanuts" }]);
        expect(ids(note.matchAllergens)).toEqual(
            [peanuts.id, stallPeanuts.id].sort(),
        );

        // A storefront opened after the note was written matches too.
        const later = await prisma.store.create({
            data: {
                name: "Rye Pop-up",
                slug: `detail-popup-${tag}`,
                organizationId: ctx.organizationId,
            },
        });
        const popupPeanuts = await prisma.storeAllergen.create({
            data: {
                storeId: later.id,
                organizationId: ctx.organizationId,
                name: "PEANUTS",
            },
        });
        // A second note naming the stall's Peanuts: still one Peanuts.
        const second = await notes.create(ctx, contactId, {
            body: "Carries an EpiPen",
            allergenIds: [stallPeanuts.id],
        });

        const detail = await details.detail(ctx, contactId);
        const rows = detail.notes?.rows ?? [];
        expect(rows.map((n) => n.allergens)).toEqual([
            [{ id: stallPeanuts.id, name: " peanuts " }],
            [{ id: peanuts.id, name: "Peanuts" }],
        ]);
        const everywhere = [
            peanuts.id,
            stallPeanuts.id,
            popupPeanuts.id,
        ].sort();
        for (const row of rows) {
            expect(ids(row.matchAllergens)).toEqual(everywhere);
            expect(ids(row.matchAllergens)).not.toContain(sesame.id);
            expect(ids(row.matchAllergens)).not.toContain(stallMustard.id);
        }
        expect(detail.allergens).toEqual([
            { id: stallPeanuts.id, name: " peanuts " },
        ]);

        await notes.remove(ctx, contactId, second.id);
        await notes.remove(ctx, contactId, note.id);
    });

    it("refuses an allergen from another organization's list", async () => {
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

        await expect(
            notes.create(ctx, contactId, { allergenIds: [mustard.id] }),
        ).rejects.toThrow(/not on your storefront's allergen list/);
        expect(await prisma.contactNote.count({ where: { contactId } })).toBe(
            0,
        );
    });
});
