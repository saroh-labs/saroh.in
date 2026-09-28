/**
 * Editing a customer's email and address against a real Postgres (C8): the
 * saved round trip and its "Details changed" line, an email another
 * contact holds, a site account's sign-in email left alone, the verified
 * stamp cleared (DEC-049), placeholders refused and India's PIN checked.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { CustomerWorkspaceService } from "../customer-workspace/customer-workspace.service";
import { ContactsService } from "./contacts.service";

const contacts = new ContactsService();

let owner: OrganizationContext;
let rival: OrganizationContext;

async function contact(
    organizationId: string,
    data: {
        email: string;
        firstName?: string;
        emailVerifiedAt?: Date;
        emailVerifiedVia?: "SIGN_IN_CODE" | "BOOKING_CONFIRMATION";
    },
) {
    return prisma.contact.create({ data: { organizationId, ...data } });
}

beforeAll(async () => {
    const [org, other] = await Promise.all([
        prisma.organization.create({
            data: { name: "Northwind", slug: `c8-nw-${process.pid}` },
        }),
        prisma.organization.create({
            data: { name: "Elsewhere", slug: `c8-other-${process.pid}` },
        }),
    ]);
    owner = { organizationId: org.id, userId: "user_1", role: "OWNER" };
    rival = { organizationId: other.id, userId: "user_2", role: "OWNER" };
});

describe("editing a customer's email and address (C8)", () => {
    it("saves a new email and an address, and the timeline says so", async () => {
        const ananya = await contact(owner.organizationId, {
            email: "ananya@example.com",
            firstName: "Ananya",
        });

        await contacts.update(owner, ananya.id, {
            email: "Ananya.Rao@Gmail.com".toLowerCase(),
            addressLine1: "12 Hill Road",
            addressLine2: "Indiranagar",
            city: "Bengaluru",
            state: "29",
            postalCode: "560 038",
            country: "IN",
        });

        const saved = await prisma.contact.findUniqueOrThrow({
            where: { id: ananya.id },
        });
        expect(saved).toMatchObject({
            email: "ananya.rao@gmail.com",
            addressLine1: "12 Hill Road",
            addressLine2: "Indiranagar",
            city: "Bengaluru",
            state: "Karnataka",
            postalCode: "560038",
            country: "IN",
        });

        const audit = await prisma.auditEvent.findFirstOrThrow({
            where: { targetId: ananya.id, action: "customer.details.changed" },
        });
        expect(audit.metadata).toEqual({ fields: ["email", "address"] });

        const workspace = new CustomerWorkspaceService({
            listViews: () => Promise.resolve([]),
        } as never);
        const { events } = await workspace.timeline(owner, ananya.id);
        expect(events.map((e) => e.title)).toContain("Details changed");
    });

    it("refuses an email another customer holds, naming them", async () => {
        const priya = await contact(owner.organizationId, {
            email: "priya@example.com",
            firstName: "Priya",
        });
        const meera = await contact(owner.organizationId, {
            email: "meera@example.com",
        });

        const err = await contacts
            .update(owner, meera.id, { email: "priya@example.com" })
            .catch((e: unknown) => e);

        expect(err).toBeInstanceOf(ConflictException);
        expect((err as ConflictException).getResponse()).toMatchObject({
            message: "Priya already has this email.",
            details: { field: "email", contactId: priya.id },
        });
        const kept = await prisma.contact.findUniqueOrThrow({
            where: { id: meera.id },
        });
        expect(kept.email).toBe("meera@example.com");
    });

    it("lets another business's customer keep the same email", async () => {
        await contact(rival.organizationId, { email: "shared@example.com" });
        const here = await contact(owner.organizationId, {
            email: "someone@example.com",
        });

        await contacts.update(owner, here.id, { email: "shared@example.com" });

        const saved = await prisma.contact.findUniqueOrThrow({
            where: { id: here.id },
        });
        expect(saved.email).toBe("shared@example.com");
    });

    it("clears a verified stamp, and leaves the site account's email alone", async () => {
        const kiran = await contact(owner.organizationId, {
            email: "kiran@example.com",
            emailVerifiedAt: new Date(),
            emailVerifiedVia: "SIGN_IN_CODE",
        });
        await prisma.customerAccount.create({
            data: {
                organizationId: owner.organizationId,
                contactId: kiran.id,
                email: "kiran@example.com",
                emailVerifiedAt: new Date(),
            },
        });

        await contacts.update(owner, kiran.id, {
            email: "kiran.das@example.com",
        });

        const saved = await prisma.contact.findUniqueOrThrow({
            where: { id: kiran.id },
            include: { customerAccounts: true },
        });
        expect(saved.email).toBe("kiran.das@example.com");
        expect(saved.emailVerifiedAt).toBeNull();
        expect(saved.emailVerifiedVia).toBeNull();
        expect(saved.customerAccounts[0]?.email).toBe("kiran@example.com");
    });

    it("keeps the stamp when only the name changes", async () => {
        const at = new Date("2026-09-01T00:00:00Z");
        const rahul = await contact(owner.organizationId, {
            email: "rahul@example.com",
            emailVerifiedAt: at,
            emailVerifiedVia: "BOOKING_CONFIRMATION",
        });

        await contacts.update(owner, rahul.id, {
            firstName: "Rahul",
            email: "rahul@example.com",
        });

        const saved = await prisma.contact.findUniqueOrThrow({
            where: { id: rahul.id },
        });
        expect(saved.emailVerifiedAt?.getTime()).toBe(at.getTime());
    });

    it("refuses a placeholder address as invalid", async () => {
        const c = await contact(owner.organizationId, {
            email: "placeholder-test@example.com",
        });
        await expect(
            contacts.update(owner, c.id, {
                email: `removed+${c.id}@removed.invalid`,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses a four-digit PIN in India and saves nothing", async () => {
        const c = await contact(owner.organizationId, {
            email: "pin-test@example.com",
        });
        await expect(
            contacts.update(owner, c.id, {
                addressLine1: "12 Hill Road",
                postalCode: "5600",
                country: "IN",
            }),
        ).rejects.toThrow("A PIN code is six digits, like 560038.");
        const saved = await prisma.contact.findUniqueOrThrow({
            where: { id: c.id },
        });
        expect(saved.addressLine1).toBeNull();
    });

    it("404s another business's customer", async () => {
        const theirs = await contact(rival.organizationId, {
            email: "theirs@example.com",
        });
        await expect(
            contacts.update(owner, theirs.id, { city: "Pune" }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
