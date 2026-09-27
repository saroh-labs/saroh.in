/**
 * A contact for every paying customer, and duplicate suggestions (C2,
 * DEC-041), against a real Postgres: a payment links its store customer in
 * the invoice's transaction; a contact already holding the email is left for
 * staff; the backfill makes BACKFILL links with no user and changes nothing
 * the second time; and the suggestions find contacts sharing a phone unless
 * one signs in, or staff split them. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import {
    backfillPayingCustomerContacts,
    normaliseBackfillEmail,
    prisma,
} from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import {
    reservedAccountEmail,
    reservedMergedEmail,
    reservedRemovedEmail,
} from "../contacts/contact-email";
import { ensureOrderInvoice } from "../invoices/order-invoicing";
import { CustomerWorkspaceService } from "./customer-workspace.service";
import { normaliseEmail } from "./duplicates";
import { ensureContactForPaidOrder } from "./ensure-contact";

const tag = `${process.pid}-${Date.now()}`;

const availability = {
    listViews: jest
        .fn()
        .mockResolvedValue(
            ["CRM", "COMMERCE"].map((key) => ({ key, readiness: "ACTIVE" })),
        ),
} as unknown as ModuleAvailabilityService;
const workspace = new CustomerWorkspaceService(availability);

describe("A contact for every paying customer (DB, C2)", () => {
    let ownerId = "";
    let ctx: OrganizationContext;
    let orgId = "";
    let storeId = "";
    let n = 0;

    const customer = (email: string, over: Record<string, unknown> = {}) =>
        prisma.customer.create({
            data: {
                storeId,
                organizationId: orgId,
                email,
                firstName: "Asha",
                lastName: "Rao",
                phone: "+91 98765 43210",
                ...over,
            },
        });

    const order = (customerId: string, paymentStatus = "UNPAID") =>
        prisma.order.create({
            data: {
                storeId,
                organizationId: orgId,
                orderId: `ORD-${tag}-${++n}`,
                customerId,
                subtotal: "450",
                total: "450",
                currency: "INR",
                paymentStatus,
                items: {
                    create: {
                        productId: productIdRef.id,
                        quantity: 1,
                        price: "450",
                    },
                },
            },
        });

    /** Pay an order by hand, as the orders service does: status, then invoice. */
    const pay = (orderId: string) =>
        prisma.$transaction(async (tx) => {
            await tx.order.update({
                where: { id: orderId },
                data: { paymentStatus: "PAID" },
            });
            return ensureOrderInvoice(tx, orderId, { method: "RECORDED" });
        });

    const linksOf = (customerId: string) =>
        prisma.customerIdentityLink.findMany({
            where: { customerId },
            select: {
                contactId: true,
                reason: true,
                linkedByUserId: true,
            },
        });

    const productIdRef = { id: "" };

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `c2-owner-${tag}@example.com` },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "Rye & Co.", slug: `c2-org-${tag}` },
            })
        ).id;
        ctx = { organizationId: orgId, userId: ownerId, role: "OWNER" };
        storeId = (
            await prisma.store.create({
                data: {
                    name: "Rye & Co.",
                    slug: `c2-rye-${tag}`,
                    organizationId: orgId,
                },
            })
        ).id;
        productIdRef.id = (
            await prisma.product.create({
                data: {
                    storeId,
                    organizationId: orgId,
                    name: "Sourdough",
                    slug: `c2-sourdough-${tag}`,
                    price: "450",
                },
            })
        ).id;
    });

    it("links a pay-later customer to a new contact in the invoice's transaction", async () => {
        const cust = await customer(" Priya@Example.com ");
        const o = await order(cust.id);

        expect(await linksOf(cust.id)).toEqual([]);
        const invoice = await pay(o.id);
        expect(invoice?.created).toBe(true);

        const [link] = await linksOf(cust.id);
        expect(link).toEqual(
            expect.objectContaining({
                reason: "PAYMENT",
                linkedByUserId: null,
            }),
        );
        const contact = await prisma.contact.findUniqueOrThrow({
            where: { id: link!.contactId },
        });
        expect(contact).toEqual(
            expect.objectContaining({
                organizationId: orgId,
                email: "priya@example.com",
                firstName: "Asha",
                lastName: "Rao",
                phone: "+91 98765 43210",
            }),
        );

        // Paying again (an edit's difference) finds the link and makes nothing.
        await pay(o.id);
        expect(await linksOf(cust.id)).toHaveLength(1);
    });

    it("rolls the contact back with a payment that fails", async () => {
        const cust = await customer("rollback@example.com");
        const o = await order(cust.id);
        await expect(
            prisma.$transaction(async (tx) => {
                await tx.order.update({
                    where: { id: o.id },
                    data: { paymentStatus: "PAID" },
                });
                await ensureOrderInvoice(tx, o.id);
                throw new Error("provider said no");
            }),
        ).rejects.toThrow("provider said no");
        expect(await linksOf(cust.id)).toEqual([]);
        expect(
            await prisma.contact.count({
                where: { organizationId: orgId, email: "rollback@example.com" },
            }),
        ).toBe(0);
    });

    it("does nothing for an order that isn't paid, or a walk-in", async () => {
        const cust = await customer("unpaid@example.com");
        const o = await order(cust.id);
        await expect(
            prisma.$transaction((tx) => ensureContactForPaidOrder(tx, o)),
        ).resolves.toBeNull();
        expect(await linksOf(cust.id)).toEqual([]);

        await expect(
            prisma.$transaction((tx) =>
                ensureContactForPaidOrder(tx, {
                    organizationId: orgId,
                    customerId: null,
                    paymentStatus: "PAID",
                }),
            ),
        ).resolves.toBeNull();

        const nobody = await customer("  ", { phone: null });
        const paid = await order(nobody.id);
        await pay(paid.id);
        expect(await linksOf(nobody.id)).toEqual([]);
    });

    it("leaves a store customer whose email a contact holds unlinked, and suggests them", async () => {
        const held = await prisma.contact.create({
            data: { organizationId: orgId, email: "Meera@example.com" },
        });
        const cust = await customer("meera@example.com", { phone: null });
        await pay((await order(cust.id)).id);

        expect(await linksOf(cust.id)).toEqual([]);
        expect(
            await prisma.contact.count({
                where: {
                    organizationId: orgId,
                    email: { equals: "meera@example.com", mode: "insensitive" },
                },
            }),
        ).toBe(1);
        await expect(workspace.suggestLinks(ctx, held.id)).resolves.toEqual([
            expect.objectContaining({
                kind: "customer",
                customerId: cust.id,
                matchedOn: ["email"],
            }),
        ]);
    });

    it("leaves a store customer whose email a site account signs in with", async () => {
        const separate = await prisma.contact.create({
            data: { organizationId: orgId, email: `sep-${tag}@x.com` },
        });
        await prisma.contact.update({
            where: { id: separate.id },
            data: { email: reservedAccountEmail(separate.id) },
        });
        await prisma.customerAccount.create({
            data: {
                organizationId: orgId,
                contactId: separate.id,
                email: "kiran@example.com",
                emailVerifiedAt: new Date(),
            },
        });
        const cust = await customer("kiran@example.com", { phone: null });
        await pay((await order(cust.id)).id);
        expect(await linksOf(cust.id)).toEqual([]);
        await expect(workspace.suggestLinks(ctx, separate.id)).resolves.toEqual(
            [expect.objectContaining({ customerId: cust.id })],
        );
    });

    it("makes a new contact for an email a tombstone used to hold", async () => {
        const tombstone = await prisma.contact.create({
            data: { organizationId: orgId, email: "old@example.com" },
        });
        await prisma.contact.update({
            where: { id: tombstone.id },
            data: { email: reservedMergedEmail(tombstone.id) },
        });
        const cust = await customer("old@example.com", { phone: null });
        await pay((await order(cust.id)).id);
        const [link] = await linksOf(cust.id);
        expect(link?.reason).toBe("PAYMENT");
        expect(link?.contactId).not.toBe(tombstone.id);
    });

    it("gives two payments at once for one customer one contact", async () => {
        const cust = await customer("race@example.com", { phone: null });
        const [a, b] = [await order(cust.id), await order(cust.id)];
        await Promise.all([pay(a.id), pay(b.id)]);
        expect(await linksOf(cust.id)).toHaveLength(1);
        expect(
            await prisma.contact.count({
                where: { organizationId: orgId, email: "race@example.com" },
            }),
        ).toBe(1);
    });

    it("backfills paying customers with BACKFILL links, and changes nothing the second time", async () => {
        const paid = await customer("backfill@example.com", { phone: null });
        await order(paid.id, "PAID");
        const unpaid = await customer("never-paid@example.com", {
            phone: null,
        });
        await order(unpaid.id);
        await prisma.contact.create({
            data: { organizationId: orgId, email: "taken@example.com" },
        });
        const taken = await customer("taken@example.com", { phone: null });
        await order(taken.id, "PAID");
        const removed = await customer(reservedRemovedEmail("x"), {
            phone: null,
        });
        await order(removed.id, "PAID");

        const first = await backfillPayingCustomerContacts(
            prisma,
            normaliseEmail,
        );
        // Also counted: the paying customers the tests above left unlinked
        // (Meera's and Kiran's emails are held; the blank email is skipped).
        expect(first).toEqual(
            expect.objectContaining({ made: 1, suggested: 3, skipped: 2 }),
        );
        expect(await linksOf(paid.id)).toEqual([
            expect.objectContaining({
                reason: "BACKFILL",
                linkedByUserId: null,
            }),
        ]);
        expect(await linksOf(unpaid.id)).toEqual([]);
        expect(await linksOf(taken.id)).toEqual([]);
        expect(await linksOf(removed.id)).toEqual([]);

        const second = await backfillPayingCustomerContacts(
            prisma,
            normaliseEmail,
        );
        expect(second).toEqual({
            ...first,
            unlinked: first.unlinked - 1,
            made: 0,
        });
        expect(await linksOf(paid.id)).toHaveLength(1);
    });

    it("writes a staff link with its user and MANUAL; links from before read MANUAL", async () => {
        const contact = await prisma.contact.create({
            data: { organizationId: orgId, email: "staff@example.com" },
        });
        const cust = await customer("staff-link@example.com");
        await workspace.link(ctx, contact.id, cust.id);
        expect(await linksOf(cust.id)).toEqual([
            {
                contactId: contact.id,
                reason: "MANUAL",
                linkedByUserId: ownerId,
            },
        ]);

        // A row written without a reason — as every link before C2 was.
        const old = await customer("old-link@example.com");
        await prisma.$executeRaw`
            INSERT INTO "CustomerIdentityLink" (id, "organizationId", "contactId", "customerId", "linkedByUserId")
            VALUES (${`old-${tag}`}, ${orgId}, ${contact.id}, ${old.id}, ${ownerId})`;
        expect((await linksOf(old.id))[0]?.reason).toBe("MANUAL");
    });

    it("agrees with the API on every reserved placeholder", () => {
        for (const email of [
            reservedAccountEmail("c1"),
            reservedMergedEmail("c1"),
            reservedRemovedEmail("c1"),
            " Asha@Example.com ",
            "",
        ]) {
            expect(normaliseBackfillEmail(email)).toBe(normaliseEmail(email));
        }
    });
});

describe("Duplicate contacts (DB, C2)", () => {
    let ownerId = "";
    let ctx: OrganizationContext;
    let orgId = "";

    const contact = (email: string, phone: string | null) =>
        prisma.contact.create({
            data: { organizationId: orgId, email, phone },
        });

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `c2-dup-owner-${tag}@example.com` },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "Pulse", slug: `c2-dup-${tag}` },
            })
        ).id;
        ctx = { organizationId: orgId, userId: ownerId, role: "OWNER" };
    });

    const contactsSuggested = async (contactId: string) =>
        (
            await workspace.suggestLinks(ctx, contactId, {
                includeContacts: true,
            })
        )
            .filter((s) => s.kind === "contact")
            .map((s) => (s.kind === "contact" ? s.contactId : ""));

    it("suggests two contacts sharing a phone, not an email, when neither signs in", async () => {
        const a = await contact("dev@example.com", "+91 98111 22233");
        const b = await contact("dev.k@example.com", "9811122233");
        await contact("far@example.com", "5559811122233");
        expect(await contactsSuggested(a.id)).toEqual([b.id]);
        expect(await contactsSuggested(b.id)).toEqual([a.id]);

        // Only when asked: today's Customer Detail only links.
        expect(
            (await workspace.suggestLinks(ctx, a.id)).some(
                (s) => s.kind === "contact",
            ),
        ).toBe(false);
    });

    it("never suggests a phone-only pair when one signs in", async () => {
        const a = await contact("ria@example.com", "7000011111");
        const b = await contact("someone@example.com", "+91 70000 11111");
        await prisma.customerAccount.create({
            data: {
                organizationId: orgId,
                contactId: b.id,
                email: "someone@example.com",
                emailVerifiedAt: new Date(),
            },
        });
        expect(await contactsSuggested(a.id)).toEqual([]);
        expect(await contactsSuggested(b.id)).toEqual([]);
    });

    it("suggests the separate contact a sign-in made, and never after staff split them", async () => {
        const known = await contact("nia@example.com", null);
        const separate = await contact(`tmp-${tag}@example.com`, null);
        await prisma.contact.update({
            where: { id: separate.id },
            data: { email: reservedAccountEmail(separate.id) },
        });
        const account = await prisma.customerAccount.create({
            data: {
                organizationId: orgId,
                contactId: separate.id,
                email: "nia@example.com",
                emailVerifiedAt: new Date(),
            },
        });
        expect(await contactsSuggested(known.id)).toEqual([separate.id]);
        const [suggestion] = (
            await workspace.suggestLinks(ctx, known.id, {
                includeContacts: true,
            })
        ).filter((s) => s.kind === "contact");
        // The account's email, never the placeholder.
        expect(suggestion).toEqual(
            expect.objectContaining({
                email: "nia@example.com",
                signsIn: true,
                matchedOn: ["email"],
            }),
        );

        // "This isn't them" (A4) records the contact the account left.
        await prisma.customerAccount.update({
            where: { id: account.id },
            data: { unlinkedFromContactId: known.id },
        });
        expect(await contactsSuggested(known.id)).toEqual([]);
        expect(await contactsSuggested(separate.id)).toEqual([]);
    });
});
