// D18: what narrows the Invoices list by what the paper was for, and what
// the list's query accepts. The rows themselves are in list-filter.db.spec.
import "reflect-metadata";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { ListInvoicesQueryDto } from "./dto";
import { listFilterWhere } from "./list-filter";

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

    it("accepts a pack, course or order id, and refuses one far too long", async () => {
        expect(
            await invalid({ packId: "pk_1", courseId: "co_1", orderId: "o_1" }),
        ).toEqual([]);
        expect(await invalid({ packId: "x".repeat(65) })).toEqual(["packId"]);
    });
});
