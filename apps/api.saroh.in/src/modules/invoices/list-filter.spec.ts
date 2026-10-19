// D18: what narrows the Invoices list by what the paper was for, and what
// the list's query accepts. The rows themselves are in list-filter.db.spec.
import "reflect-metadata";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { ListInvoicesQueryDto } from "./dto";
import {
    listFilterWhere,
    paidFromWhere,
    SEARCH_MAX,
    searchWhere,
} from "./list-filter";

describe("listFilterWhere", () => {
    it("adds nothing when nothing narrows the list", () => {
        expect(listFilterWhere({})).toEqual({});
    });

    it("files a correction under what its original was for", () => {
        expect(listFilterWhere({ source: "SUBSCRIPTION" })).toEqual({
            AND: [
                {
                    OR: [
                        { relatedInvoiceId: null, source: "SUBSCRIPTION" },
                        { relatedInvoice: { source: "SUBSCRIPTION" } },
                    ],
                },
            ],
        });
    });

    it("finds a pack's sales through their purchases, and their corrections", () => {
        expect(listFilterWhere({ packId: "pk_1" })).toEqual({
            AND: [
                {
                    OR: [
                        {
                            relatedInvoiceId: null,
                            packPurchase: { packId: "pk_1" },
                        },
                        {
                            relatedInvoice: {
                                packPurchase: { packId: "pk_1" },
                            },
                        },
                    ],
                },
            ],
        });
    });

    it("finds a course's through its enrolments", () => {
        const where = listFilterWhere({ courseId: "co_1" });
        expect(where.AND).toEqual([
            {
                OR: [
                    {
                        relatedInvoiceId: null,
                        courseEnrollment: { courseId: "co_1" },
                    },
                    {
                        relatedInvoice: {
                            courseEnrollment: { courseId: "co_1" },
                        },
                    },
                ],
            },
        ]);
    });

    it("finds every paper of one order by the order it names", () => {
        expect(listFilterWhere({ orderId: "ord_1" })).toEqual({
            AND: [{ orderId: "ord_1" }],
        });
    });

    it("asks for all of them together when more than one is sent", () => {
        const where = listFilterWhere({ source: "PACK", packId: "pk_1" });
        expect(where.AND).toHaveLength(2);
    });
});

describe("searchWhere (DEC-173, U4)", () => {
    const like = (contains: string) => ({ contains, mode: "insensitive" });

    it("matches a name or part of a number, case-insensitively", () => {
        expect(searchWhere(" vivek ", null)).toEqual({
            OR: [
                { billToName: like("vivek") },
                { number: like("vivek") },
                { contact: { firstName: like("vivek") } },
                { contact: { lastName: like("vivek") } },
            ],
        });
    });

    it("finds a full name across the contact's first and last name", () => {
        const where = searchWhere("vivek nair", null);
        expect(where.OR).toContainEqual({
            AND: [
                {
                    contact: {
                        OR: [
                            { firstName: like("vivek") },
                            { lastName: like("vivek") },
                        ],
                    },
                },
                {
                    contact: {
                        OR: [
                            { firstName: like("nair") },
                            { lastName: like("nair") },
                        ],
                    },
                },
            ],
        });
    });

    it("adds the total, and the invoices with that much left, for an amount", () => {
        const where = searchWhere("₹8,400", 840_000, ["inv_left"]);
        expect(where.OR).toContainEqual({ total: "8400.00" });
        expect(where.OR).toContainEqual({ id: { in: ["inv_left"] } });
    });

    it("asks for no amount when the search isn't one", () => {
        const where = searchWhere("8,40", null, ["inv_left"]);
        expect(JSON.stringify(where)).not.toContain("total");
        expect(JSON.stringify(where)).not.toContain("inv_left");
    });
});

describe("paidFromWhere (DEC-173, U4)", () => {
    it("counts a payment that counts since then, or an order's paper paid since", () => {
        const from = new Date("2026-09-30T18:30:00.000Z");
        expect(paidFromWhere(from)).toEqual({
            kind: { not: "CREDIT_NOTE" },
            OR: [
                {
                    payments: {
                        some: {
                            removedAt: null,
                            OR: [
                                { bankStatus: null },
                                { bankStatus: { not: "BOUNCED" } },
                            ],
                            receivedAt: { gte: from },
                        },
                    },
                },
                { orderId: { not: null }, paidAt: { gte: from } },
            ],
        });
    });
});

describe("what the list's query accepts", () => {
    async function invalid(query: Record<string, unknown>) {
        const dto = plainToInstance(ListInvoicesQueryDto, query);
        return (await validate(dto)).map((e) => e.property);
    }

    it.each(["ORDER", "BOOKING", "SUBSCRIPTION", "PACK", "COURSE", "MANUAL"])(
        "accepts the source %s",
        async (source) => {
            expect(await invalid({ source })).toEqual([]);
        },
    );

    it("refuses a source that isn't one", async () => {
        expect(await invalid({ source: "WALK_IN" })).toEqual(["source"]);
        expect(await invalid({ source: "order" })).toEqual(["source"]);
    });

    it("takes a search, trimmed, and refuses one too long", async () => {
        const dto = plainToInstance(ListInvoicesQueryDto, { q: "  vivek " });
        expect(dto.q).toBe("vivek");
        expect(await invalid({ q: "₹8,400" })).toEqual([]);
        expect(await invalid({ q: "x".repeat(SEARCH_MAX) })).toEqual([]);
        expect(await invalid({ q: "x".repeat(SEARCH_MAX + 1) })).toEqual(["q"]);
        // A blank search is none.
        expect(plainToInstance(ListInvoicesQueryDto, { q: "  " }).q).toBe(
            undefined,
        );
    });

    it.each(["owed", "cheques", "draft", "issued", "overdue", "paid", "void"])(
        "accepts the view %s",
        async (view) => {
            expect(await invalid({ view })).toEqual([]);
        },
    );

    it("takes Paid from as a day, and refuses an instant or a non-date", async () => {
        expect(await invalid({ paidFrom: "2026-10-01" })).toEqual([]);
        expect(await invalid({ paidFrom: "2026-10-01T00:00:00.000Z" })).toEqual(
            ["paidFrom"],
        );
        expect(await invalid({ paidFrom: "2026-13-01" })).toEqual(["paidFrom"]);
        expect(await invalid({ paidFrom: "this month" })).toEqual(["paidFrom"]);
    });

    it("accepts a pack, course or order id, and refuses one far too long", async () => {
        expect(
            await invalid({ packId: "pk_1", courseId: "co_1", orderId: "o_1" }),
        ).toEqual([]);
        expect(await invalid({ packId: "x".repeat(65) })).toEqual(["packId"]);
    });
});
