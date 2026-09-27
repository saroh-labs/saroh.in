import { beforeEach, describe, expect, it, vi } from "vitest";

const getJson = vi.fn();
vi.mock("@/lib/api/http", () => ({
    getJson: (path: string) => getJson(path) as unknown,
    orgBase: () => Promise.resolve("/organizations/org_1"),
}));

import {
    listAllOrderRows,
    listOrderRows,
    orderListQuery,
} from "@/lib/orders/business-service";

const page = (ids: string[], nextCursor: string | null) => ({
    rows: ids.map((id) => ({ id })),
    counts: { all: 3, open: 1, refunded: 0 },
    nextCursor,
});

beforeEach(() => getJson.mockReset());

describe("orderListQuery", () => {
    it("always asks for v=2, repeats lists and leaves out what is unset", () => {
        expect(
            orderListQuery({
                stage: ["NEW", "READY"],
                customerId: "c1",
                late: false,
                q: "",
                storeId: undefined,
            }),
        ).toBe("v=2&stage=NEW&stage=READY&customerId=c1&late=false");
    });
});

describe("listOrderRows", () => {
    it("reads one page of the v2 list", async () => {
        getJson.mockResolvedValue(page(["o1"], null));
        const result = await listOrderRows({ tab: "open" });
        expect(getJson).toHaveBeenCalledWith(
            "/organizations/org_1/orders?v=2&tab=open",
        );
        expect(result.counts.open).toBe(1);
    });

    it("reads an older API's bare array as one page, not a crash (O-2)", async () => {
        // An API rolled back past B1 answers every order, unpaged.
        getJson.mockResolvedValue([
            { id: "o1", status: "PENDING", standing: "UNFULFILLED" },
            { id: "o2", status: "SHIPPED", standing: "FULFILLED" },
            { id: "o3", status: "DELIVERED", standing: "FULFILLED" },
            {
                id: "o4",
                status: "DELIVERED",
                standing: "REFUNDED",
                payment: "REFUNDED",
            },
        ]);
        const all = await listOrderRows();
        expect(all.rows.map((r) => r.id)).toEqual(["o1", "o2", "o3", "o4"]);
        expect(all.counts).toEqual({ all: 4, open: 2, refunded: 1 });
        expect(all.nextCursor).toBeNull();

        const open = await listOrderRows({ tab: "open" });
        expect(open.rows.map((r) => r.id)).toEqual(["o1", "o2"]);
        // listAllOrderRows stops rather than asking for a next page.
        expect((await listAllOrderRows()).complete).toBe(true);
    });

    it("reads a missing list as an empty page", async () => {
        getJson.mockResolvedValue(null);
        expect(await listOrderRows()).toEqual({
            rows: [],
            counts: { all: 0, open: 0, refunded: 0 },
            nextCursor: null,
        });
    });
});

describe("listAllOrderRows", () => {
    it("follows the cursor to the end", async () => {
        getJson
            .mockResolvedValueOnce(page(["o1", "o2"], "o2"))
            .mockResolvedValueOnce(page(["o3"], null));
        const { rows, complete } = await listAllOrderRows({ customerId: "c1" });
        expect(rows.map((r) => r.id)).toEqual(["o1", "o2", "o3"]);
        expect(complete).toBe(true);
        expect(getJson).toHaveBeenLastCalledWith(
            "/organizations/org_1/orders?v=2&customerId=c1&cursor=o2",
        );
    });

    it("stops after its page limit and says it did", async () => {
        getJson.mockResolvedValue(page(["o1"], "o1"));
        const { rows, complete } = await listAllOrderRows({}, 2);
        expect(rows).toHaveLength(2);
        expect(complete).toBe(false);
    });
});
