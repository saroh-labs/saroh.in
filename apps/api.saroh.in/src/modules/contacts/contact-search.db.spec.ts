/**
 * Finding a customer by name or phone against a real Postgres (E4): the
 * digits of a stored phone, +91 and without, the order by last booking or
 * payment, placeholders never shown and retired contacts never found, and
 * the organization boundary. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ContactsService } from "./contacts.service";

const contacts = new ContactsService();

let owner: OrganizationContext;
let rivalOrg: string;
const ids: Record<string, string> = {};

async function contact(
    organizationId: string,
    key: string,
    data: {
        email: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
        createdAt?: Date;
    },
) {
    ids[key] = (
        await prisma.contact.create({ data: { organizationId, ...data } })
    ).id;
}

beforeAll(async () => {
    const [org, rival] = await Promise.all([
        prisma.organization.create({
            data: { name: "Kavi Dental", slug: `e4-kavi-${process.pid}` },
        }),
        prisma.organization.create({
            data: { name: "Another clinic", slug: `e4-other-${process.pid}` },
        }),
    ]);
    owner = { organizationId: org.id, userId: "user_1", role: "OWNER" };
    rivalOrg = rival.id;

    await contact(org.id, "priya", {
        email: "priya@example.com",
        firstName: "Priya",
        lastName: "Raman",
        phone: "+91 98765 43210",
        createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    await contact(org.id, "arjun", {
        email: "arjun@example.com",
        firstName: "Arjun",
        lastName: "Mehta",
        phone: "9812343210",
        createdAt: new Date("2026-01-02T00:00:00Z"),
    });
    await contact(org.id, "meera", {
        email: "meera@example.com",
        firstName: "Meera",
        lastName: "Priyadarshini",
        createdAt: new Date("2026-01-03T00:00:00Z"),
    });
    // A site account's separate contact (A4): found, shown by the account's
    // email, never by its placeholder.
    await contact(org.id, "separate", {
        email: "account+sep@account.invalid",
        firstName: "Kiran",
        lastName: "Das",
        createdAt: new Date("2026-01-04T00:00:00Z"),
    });
    await prisma.customerAccount.create({
        data: {
            organizationId: org.id,
            contactId: ids.separate!,
            email: "kiran@example.com",
            emailVerifiedAt: new Date(),
        },
    });
    // A merge's tombstone: never found.
    await contact(org.id, "merged", {
        email: "merged+old@removed.invalid",
        firstName: "Priya",
        lastName: "Old",
        phone: "9876543210",
    });
    // Another business's Priya, same phone.
    await contact(rival.id, "rivalPriya", {
        email: "priya@example.com",
        firstName: "Priya",
        lastName: "Raman",
        phone: "9876543210",
    });

    // Arjun booked last week, and Priya paid an invoice yesterday: Priya is
    // the most recent, then Arjun, then the rest newest first.
    const service = await prisma.service.create({
        data: {
            organizationId: org.id,
            name: "Check-up",
            durationMinutes: 30,
            timezone: "Asia/Kolkata",
        },
    });
    await prisma.booking.create({
        data: {
            organizationId: org.id,
            serviceId: service.id,
            contactId: ids.arjun!,
            startAt: new Date("2026-09-20T05:00:00Z"),
            endAt: new Date("2026-09-20T05:30:00Z"),
            timezone: "Asia/Kolkata",
            snapshot: {},
            bookerEmail: "arjun@example.com",
        },
    });
    await prisma.invoice.create({
        data: {
            organizationId: org.id,
            contactId: ids.priya!,
            status: "PAID",
            number: "INV-1",
            currency: "INR",
            subtotal: "100",
            tax: "0",
            total: "100",
            paidAt: new Date("2026-09-26T05:00:00Z"),
        },
    });
});

const names = (rows: { name: string | null }[]) => rows.map((r) => r.name);

describe("contact search (E4, real database)", () => {
    it("typing the last 4 digits of a phone finds the customer", async () => {
        const rows = await contacts.search(owner, "3210");
        expect(names(rows)).toEqual(["Priya Raman", "Arjun Mehta"]);
    });

    it('"+91 98765 43210" and "9876543210" find the same contact', async () => {
        const a = await contacts.search(owner, "+91 98765 43210");
        const b = await contacts.search(owner, "9876543210");
        expect(a.map((r) => r.id)).toEqual([ids.priya]);
        expect(b.map((r) => r.id)).toEqual([ids.priya]);
        expect(a[0]!.exactOn).toEqual(["phone"]);
    });

    it("matches every word of a name against the first or last name", async () => {
        expect(names(await contacts.search(owner, "priya"))).toEqual([
            "Priya Raman",
            "Meera Priyadarshini",
        ]);
        expect(names(await contacts.search(owner, "priya ram"))).toEqual([
            "Priya Raman",
        ]);
    });

    it("lists the most recent first when nothing is typed, 8 at most", async () => {
        const rows = await contacts.search(owner, "");
        expect(names(rows)).toEqual([
            "Priya Raman",
            "Arjun Mehta",
            "Kiran Das",
            "Meera Priyadarshini",
        ]);
        expect(rows[0]!.lastSeenAt).toBe("2026-09-26T05:00:00.000Z");
        expect(await contacts.search(owner, "", 2)).toHaveLength(2);
    });

    it("finds a site account's contact by the account's email and never shows the placeholder", async () => {
        const rows = await contacts.search(owner, "kiran@");
        expect(rows).toEqual([
            expect.objectContaining({
                id: ids.separate,
                email: "kiran@example.com",
                exactOn: [],
            }),
        ]);
        expect(await contacts.search(owner, "account+")).toEqual([]);
        const all = await contacts.search(owner, "");
        expect(all.some((r) => r.email?.endsWith(".invalid"))).toBe(false);
    });

    it("says a typed email is exactly a contact's", async () => {
        const [row] = await contacts.search(owner, "Priya@Example.com");
        expect(row).toMatchObject({ id: ids.priya, exactOn: ["email"] });
    });

    it("never finds a retired contact, nor another business's", async () => {
        const found = (await contacts.search(owner, "9876543210")).map(
            (r) => r.id,
        );
        expect(found).not.toContain(ids.merged);
        expect(found).not.toContain(ids.rivalPriya);
        const theirs = await contacts.search(
            { organizationId: rivalOrg, userId: "user_2", role: "OWNER" },
            "priya",
        );
        expect(theirs.map((r) => r.id)).toEqual([ids.rivalPriya]);
    });
});
