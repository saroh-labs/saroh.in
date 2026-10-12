// What a switch to "GST is added" would take over its MRP (GST is part of
// MRP, 12 Oct 2026): the count, the first few names and the refusal's own
// sentence. DB-free: the rows are handed in.
import type { PriceTerms } from "../invoices/gst-price";
import type { OverMrpList } from "./over-mrp";
import {
    findOverMrp,
    OVER_MRP_LIST_CAP,
    overMrpName,
    overMrpRefusal,
} from "./over-mrp";

const ADDED: PriceTerms = { registered: true, mode: "ADDED" };
const INCLUDED: PriceTerms = { registered: true, mode: "INCLUDED" };

const decimal = (value: string | null) =>
    value === null ? null : { toString: () => value };

interface Row {
    id: string;
    name: string;
    price: string;
    mrp: string | null;
    gstRate?: string;
    gstPriceMode?: string | null;
    variants?: { title: string; price: string | null; mrp: string | null }[];
}

/** A database that answers the read with `rows`, and keeps what it asked. */
function reading(rows: Row[]) {
    const findMany = jest.fn().mockResolvedValue(
        rows.map((r) => ({
            id: r.id,
            name: r.name,
            price: decimal(r.price),
            mrp: decimal(r.mrp),
            currency: "INR",
            gstRate: decimal(r.gstRate ?? "18"),
            gstPriceMode: r.gstPriceMode ?? null,
            variants: (r.variants ?? []).map((v) => ({
                title: v.title,
                price: decimal(v.price),
                mrp: decimal(v.mrp),
            })),
        })),
    );
    return {
        db: { product: { findMany } } as unknown as Parameters<
            typeof findOverMrp
        >[0],
        findMany,
    };
}

describe("finding what GST added takes over its MRP", () => {
    it("lists a product over its MRP with the sums, and leaves out one at or under it", async () => {
        const { db } = reading([
            // 1,000 + 180 = 1,180 > 1,100
            { id: "p_cream", name: "Face cream", price: "1000", mrp: "1100" },
            // 1,180 = 1,180: at its MRP, allowed.
            { id: "p_oil", name: "Hair oil", price: "1000", mrp: "1180" },
            // 1,180 < 1,500
            { id: "p_soap", name: "Rose soap", price: "1000", mrp: "1500" },
        ]);
        expect(await findOverMrp(db, "org_1", ADDED)).toEqual({
            products: 1,
            options: 0,
            items: [
                {
                    productId: "p_cream",
                    name: "Face cream",
                    option: null,
                    currency: "INR",
                    listCents: 100_000,
                    payCents: 118_000,
                    mrpCents: 110_000,
                    rate: "18",
                },
            ],
            more: false,
        });
    });

    it("counts an option over its own MRP, and its product once", async () => {
        const { db } = reading([
            {
                id: "p_cream",
                name: "Face cream",
                price: "1000",
                mrp: "1500",
                variants: [
                    // Sells as the product does: nothing of its own.
                    { title: "Small", price: null, mrp: null },
                    // 1,200 + 216 = 1,416 > 1,300
                    { title: "Large", price: "1200", mrp: "1300" },
                    // 1,300 + 234 = 1,534 > 1,500 (the product's MRP)
                    { title: "Jumbo", price: "1300", mrp: null },
                ],
            },
        ]);
        const list = await findOverMrp(db, "org_1", ADDED);
        expect(list.products).toBe(1);
        expect(list.options).toBe(2);
        expect(list.items.map(overMrpName)).toEqual([
            "Face cream (Large)",
            "Face cream (Jumbo)",
        ]);
        expect(list.items.map((i) => i.payCents)).toEqual([141_600, 153_400]);
    });

    it("follows each product's own choice under the business's", async () => {
        const rows: Row[] = [
            {
                id: "p_own_added",
                name: "Own added",
                price: "1000",
                mrp: "1100",
                gstPriceMode: "ADDED",
            },
            {
                id: "p_own_included",
                name: "Own included",
                price: "1000",
                mrp: "1100",
                gstPriceMode: "INCLUDED",
            },
            { id: "p_same", name: "Same", price: "1000", mrp: "1100" },
        ];
        const added = await findOverMrp(reading(rows).db, "org_1", ADDED);
        expect(added.items.map((i) => i.productId)).toEqual([
            "p_own_added",
            "p_same",
        ]);
        const included = await findOverMrp(reading(rows).db, "org_1", INCLUDED);
        expect(included.items.map((i) => i.productId)).toEqual(["p_own_added"]);
    });

    it("never lists a typed price above its MRP that GST did not put there", async () => {
        const { db } = reading([
            {
                id: "p_odd",
                name: "Odd one",
                price: "1200",
                mrp: "1100",
                gstPriceMode: "INCLUDED",
            },
        ]);
        expect((await findOverMrp(db, "org_1", ADDED)).products).toBe(0);
    });

    it("asks only for what could be over: this business's, not archived, with a rate and an MRP", async () => {
        const { db, findMany } = reading([]);
        await findOverMrp(db, "org_1", ADDED);
        const where = (
            findMany.mock.calls[0] as [{ where: Record<string, unknown> }]
        )[0].where;
        expect(where).toMatchObject({
            organizationId: "org_1",
            status: { not: "ARCHIVED" },
            gstRate: { gt: 0 },
        });
        expect(where.AND).toEqual([
            { OR: [{ gstPriceMode: null }, { gstPriceMode: "ADDED" }] },
            {
                OR: [
                    { mrp: { not: null } },
                    { variants: { some: { mrp: { not: null } } } },
                ],
            },
        ]);
        // Under "includes GST" only a product set to GST is added can be.
        const included = reading([]);
        await findOverMrp(included.db, "org_1", INCLUDED);
        expect(
            (
                included.findMany.mock.calls[0] as [
                    { where: { AND: unknown[] } },
                ]
            )[0].where.AND[0],
        ).toEqual({ gstPriceMode: "ADDED" });
    });

    it("a business that isn't registered has none, and nothing is read", async () => {
        const { db, findMany } = reading([
            { id: "p_cream", name: "Face cream", price: "1000", mrp: "1100" },
        ]);
        expect(
            await findOverMrp(db, "org_1", {
                registered: false,
                mode: "ADDED",
            }),
        ).toEqual({ products: 0, options: 0, items: [], more: false });
        expect(findMany).not.toHaveBeenCalled();
    });

    it("names only so many, and counts them all", async () => {
        const many = Array.from({ length: OVER_MRP_LIST_CAP + 3 }, (_, i) => ({
            id: `p_${i}`,
            name: `Product ${i}`,
            price: "1000",
            mrp: "1100",
        }));
        const list = await findOverMrp(reading(many).db, "org_1", ADDED);
        expect(list.products).toBe(OVER_MRP_LIST_CAP + 3);
        expect(list.items).toHaveLength(OVER_MRP_LIST_CAP);
        expect(list.more).toBe(true);
    });
});

describe("the refusal's sentence", () => {
    const item = (name: string, option: string | null = null) => ({
        productId: `p_${name}`,
        name,
        option,
        currency: "INR",
        listCents: 100_000,
        payCents: 118_000,
        mrpCents: 110_000,
        rate: "18",
    });
    const list = (over: Partial<OverMrpList>): OverMrpList => ({
        products: 1,
        options: 0,
        items: [item("Face cream")],
        more: false,
        ...over,
    });

    it("is none when nothing would be over", () => {
        expect(overMrpRefusal(list({ products: 0, items: [] }))).toBeNull();
    });

    it("says one product by name, with the way out", () => {
        expect(overMrpRefusal(list({}))).toBe(
            'With GST added, 1 product would cost more than its MRP: Face cream. Lower the price or raise the MRP on it, or set it to "Includes GST", then save this again.',
        );
    });

    it("counts several, names the first three and counts the rest", () => {
        expect(
            overMrpRefusal(
                list({
                    products: 2,
                    items: [item("Face cream"), item("Hair oil")],
                }),
            ),
        ).toBe(
            'With GST added, 2 products would cost more than their MRP: Face cream and Hair oil. Lower the price or raise the MRP on each, or set each one to "Includes GST", then save this again.',
        );
        expect(
            overMrpRefusal(
                list({
                    products: 4,
                    options: 1,
                    items: [
                        item("Face cream"),
                        item("Hair oil", "Large"),
                        item("Lip balm"),
                        item("Night serum"),
                        item("Rose soap"),
                    ],
                }),
            ),
        ).toBe(
            'With GST added, 4 products would cost more than their MRP: Face cream, Hair oil (Large), Lip balm and 2 more. Lower the price or raise the MRP on each, or set each one to "Includes GST", then save this again.',
        );
    });

    it("says and more when the list was cut short", () => {
        expect(
            overMrpRefusal(
                list({
                    products: 40,
                    items: [
                        item("Face cream"),
                        item("Hair oil"),
                        item("Lip balm"),
                        item("Night serum"),
                    ],
                    more: true,
                }),
            ),
        ).toContain(
            "40 products would cost more than their MRP: Face cream, Hair oil, Lip balm and more.",
        );
    });
});
