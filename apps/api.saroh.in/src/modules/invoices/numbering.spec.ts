import { formatInvoiceNumber, nextInvoiceNumber } from "./numbering";

describe("invoice numbering", () => {
    it("pads to four digits and then grows", () => {
        expect(formatInvoiceNumber(1)).toBe("INV-0001");
        expect(formatInvoiceNumber(42)).toBe("INV-0042");
        expect(formatInvoiceNumber(10000)).toBe("INV-10000");
    });

    it("creates the counter at 1 for a business's first invoice, else increments", async () => {
        const upsert = jest.fn().mockResolvedValue({ lastNumber: 1 });
        const tx = { invoiceSequence: { upsert } };

        await expect(nextInvoiceNumber(tx as never, "org_1")).resolves.toBe(
            "INV-0001",
        );
        expect(upsert).toHaveBeenCalledWith({
            where: { organizationId: "org_1" },
            create: { organizationId: "org_1", lastNumber: 1 },
            update: { lastNumber: { increment: 1 } },
            select: { lastNumber: true },
        });
    });
});
