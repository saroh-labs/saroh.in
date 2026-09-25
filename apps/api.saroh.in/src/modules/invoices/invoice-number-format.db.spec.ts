/**
 * A business's own invoice number format against a real Postgres (ADR-008):
 * set through the settings service, then invoices issued across a change of
 * format, a month's end and 1 April. Nothing issued is renumbered, the
 * counter carries on across a change that keeps its restart period, and a
 * number the business already issued is stepped past — the unique index on
 * (organization, number) is never what stops a sale.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import type { MediaService } from "../media/media.service";
import { OrganizationSettingsService } from "../organizations/organization-settings.service";
import { InvoicesService } from "./invoices.service";

const invoices = new InvoicesService();
const settings = new OrganizationSettingsService(
    { record: () => Promise.resolve() } as unknown as AuditService,
    {} as MediaService,
);

/** Kiln Studio: GST-registered in Karnataka, prefix KL. */
let kiln: OrganizationContext;
let contactId: string;

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Kiln Studio", slug: `kiln-${process.pid}` },
    });
    kiln = { organizationId: org.id, userId: "user_owner", role: "OWNER" };
    await prisma.businessProfile.create({
        data: {
            organizationId: org.id,
            taxId: "29AAGCR4375J1ZU",
            gstRegistered: true,
            gstState: "29",
            invoicePrefix: "KL",
            timezone: "Asia/Kolkata",
            addressLine1: "3 Kiln Lane",
            city: "Bengaluru",
            postalCode: "560038",
        },
    });
    contactId = (
        await prisma.contact.create({
            data: {
                organizationId: org.id,
                email: "orders@cafegoa.in",
                firstName: "Café",
                lastName: "Goa",
            },
        })
    ).id;
});

/** Issue a one-line invoice dated `iso`; its number. */
async function issue(iso: string): Promise<string> {
    const { number } = await prisma.$transaction((tx) =>
        invoices.issueInTx(tx, kiln.organizationId, {
            contactId,
            currency: "INR",
            lines: [{ description: "Bowl", quantity: 1, unitPrice: "900" }],
            source: "PACK",
            issuedAt: new Date(iso),
            dueAt: new Date("2027-06-01T00:00:00Z"),
        }),
    );
    return number;
}

const format = (invoiceNumber: {
    parts: string[];
    separator: string;
    digits: number;
    restart: string;
}) => settings.update(kiln, { tax: { invoiceNumber } });

describe("a business's own number format (real database)", () => {
    it("issues across a change of format, a month's end and 1 April without a repeat", async () => {
        // Never chosen: the numbers it always had.
        expect(await issue("2026-09-10T06:00:00Z")).toBe("KL/26-27/0001");
        expect(await issue("2026-09-11T06:00:00Z")).toBe("KL/26-27/0002");

        // Mid-year, the month goes in; still restarting each financial year,
        // so the counter carries on.
        const read = await format({
            parts: ["PREFIX", "FY", "MONTH"],
            separator: "/",
            digits: 3,
            restart: "FY",
        });
        expect(read.tax.invoiceNumber).toMatchObject({
            parts: ["PREFIX", "FY", "MONTH"],
            restart: "FY",
            custom: true,
        });
        expect(await issue("2026-09-12T06:00:00Z")).toBe("KL/26-27/09/003");
        expect(await issue("2026-09-13T06:00:00Z")).toBe("KL/26-27/09/004");

        // Now it restarts each month: September's own counter starts at 1,
        // and steps past the 0003 and 0004 already issued.
        await format({
            parts: ["PREFIX", "FY", "MONTH"],
            separator: "/",
            digits: 3,
            restart: "MONTH",
        });
        expect(await issue("2026-09-14T06:00:00Z")).toBe("KL/26-27/09/001");
        expect(await issue("2026-09-15T06:00:00Z")).toBe("KL/26-27/09/002");
        expect(await issue("2026-09-16T06:00:00Z")).toBe("KL/26-27/09/005");
        expect(await issue("2026-09-17T06:00:00Z")).toBe("KL/26-27/09/006");

        // 23:59 and 00:00 in India, 30 September → 1 October.
        expect(await issue("2026-09-30T18:29:00Z")).toBe("KL/26-27/09/007");
        expect(await issue("2026-09-30T18:30:00Z")).toBe("KL/26-27/10/001");

        // 31 March → 1 April: a new month and a new financial year.
        expect(await issue("2027-03-31T18:29:00Z")).toBe("KL/26-27/03/001");
        expect(await issue("2027-03-31T18:30:00Z")).toBe("KL/27-28/04/001");

        // Nothing issued was renumbered, and no number repeats.
        const numbers = (
            await prisma.invoice.findMany({
                where: { organizationId: kiln.organizationId },
                orderBy: { createdAt: "asc" },
                select: { number: true },
            })
        ).map((i) => i.number);
        expect(numbers.slice(0, 4)).toEqual([
            "KL/26-27/0001",
            "KL/26-27/0002",
            "KL/26-27/09/003",
            "KL/26-27/09/004",
        ]);
        expect(new Set(numbers).size).toBe(numbers.length);
    });

    it("a credit note in a format too long for CN after the prefix carries it in its place", async () => {
        const first = await prisma.invoice.findFirstOrThrow({
            where: {
                organizationId: kiln.organizationId,
                number: "KL/26-27/0001",
            },
            select: { id: true },
        });
        const note = await invoices.credit(kiln, first.id, {
            reason: "Returned",
        });
        // KLCN/26-27/09/001, with room for the count to grow a digit, would
        // pass 16 characters.
        expect(note.number).toMatch(/^CN\/\d{2}-\d{2}\/\d{2}\/001$/);
    });

    it("refuses a format that would repeat numbers, and keeps the one it had", async () => {
        await expect(
            format({
                parts: ["PREFIX", "MONTH"],
                separator: "/",
                digits: 4,
                restart: "MONTH",
            }),
        ).rejects.toMatchObject({
            response: { details: { field: "invoiceNumberParts" } },
        });
        const profile = await prisma.businessProfile.findUniqueOrThrow({
            where: { organizationId: kiln.organizationId },
            select: { invoiceNumberFormat: true },
        });
        expect(profile.invoiceNumberFormat).toMatchObject({
            restart: "MONTH",
            parts: ["PREFIX", "FY", "MONTH"],
        });
    });

    it("runs the short financial year and month together, with no separator", async () => {
        const read = await format({
            parts: ["PREFIX", "FY_SHORT", "MONTH"],
            separator: "",
            digits: 4,
            restart: "MONTH",
        });
        expect(read.tax.invoiceNumber).toMatchObject({
            parts: ["PREFIX", "FY_SHORT", "MONTH"],
            separator: "",
        });
        expect(await issue("2027-05-10T06:00:00Z")).toBe("KL27050001");
        expect(await issue("2027-05-11T06:00:00Z")).toBe("KL27050002");
        // February 2028 is still the financial year that began in 2027.
        expect(await issue("2028-02-10T06:00:00Z")).toBe("KL27020001");
    });

    it("refuses the calendar year alone for a yearly restart, but reads one stored before", async () => {
        await expect(
            format({
                parts: ["PREFIX", "YEAR"],
                separator: "/",
                digits: 4,
                restart: "FY",
            }),
        ).rejects.toMatchObject({
            response: { details: { field: "invoiceNumberParts" } },
        });
        // Saved before the rule: it still reads, and still numbers.
        await prisma.businessProfile.update({
            where: { organizationId: kiln.organizationId },
            data: {
                invoiceNumberFormat: {
                    parts: ["PREFIX", "YEAR"],
                    separator: "/",
                    digits: 4,
                    restart: "FY",
                },
            },
        });
        const read = await settings.get(kiln);
        expect(read.tax.invoiceNumber).toMatchObject({
            parts: ["PREFIX", "YEAR"],
            restart: "FY",
        });
        expect(await issue("2028-06-10T06:00:00Z")).toBe("KL/2028/0001");
    });

    it("says where this month's counter stands, for the next number", async () => {
        const read = await settings.get(kiln);
        // Whatever today is, the counters are the business's own.
        expect(read.tax.invoiceNumber.counters).toEqual({
            FY: expect.any(Number),
            MONTH: expect.any(Number),
            NEVER: 0,
        });
    });
});
