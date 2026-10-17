import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
const getList = vi.fn();
vi.mock("@/lib/api/http", () => ({
    apiFetch: (path: string) => apiFetch(path) as unknown,
    getActiveOrgId: () => Promise.resolve("org_1"),
    getList: (path: string) => getList(path) as unknown,
    getJson: vi.fn(),
}));

import {
    canAddLocation,
    fromStorefronts,
    importChooserLead,
    locationLine,
    ownInBusiness,
} from "./business-stores";
import { listBusinessStores, readBusinessStores } from "./service";

const json = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
});

const NORTHWIND = [
    {
        id: "st_online",
        name: "Online",
        orderCount: 4,
        productCount: 12,
        kind: "ONLINE",
        paused: false,
    },
    {
        id: "st_shop",
        name: "High Street",
        orderCount: 0,
        productCount: 1,
        kind: "SHOP",
        paused: false,
    },
];

beforeEach(() => {
    apiFetch.mockReset();
    getList.mockReset();
});

describe("listBusinessStores", () => {
    it("lists the business's locations for any role, not the ones the person owns", async () => {
        apiFetch.mockResolvedValue(json(200, NORTHWIND));
        await expect(listBusinessStores()).resolves.toEqual([
            {
                id: "st_online",
                name: "Online",
                kind: "ONLINE",
                productCount: 12,
            },
            {
                id: "st_shop",
                name: "High Street",
                kind: "SHOP",
                productCount: 1,
            },
        ]);
        expect(apiFetch).toHaveBeenCalledWith(
            "/organizations/org_1/storefronts",
        );
        // Ownership (`GET /stores`) is never asked.
        expect(getList).not.toHaveBeenCalled();
    });

    it("gives a role that can't read them the locations it was invited to, in this business only", async () => {
        apiFetch.mockResolvedValue(json(403, {}));
        getList.mockResolvedValue([
            { id: "st_b", name: "Newer", organizationId: "org_1" },
            { id: "st_x", name: "Elsewhere", organizationId: "org_2" },
            { id: "st_a", name: "Older", organizationId: "org_1" },
        ]);
        await expect(listBusinessStores()).resolves.toEqual([
            { id: "st_a", name: "Older", kind: null, productCount: null },
            { id: "st_b", name: "Newer", kind: null, productCount: null },
        ]);
        expect(getList).toHaveBeenCalledWith("/stores");
    });

    it("throws when the locations can't be read, never an empty list", async () => {
        apiFetch.mockResolvedValue(json(500, {}));
        await expect(listBusinessStores()).rejects.toThrow();
        await expect(readBusinessStores()).resolves.toBeNull();
    });
});

describe("fromStorefronts", () => {
    it("leaves a count an older API didn't send unsaid, not 0", () => {
        expect(
            fromStorefronts([{ id: "s", name: "Shop", kind: "SHOP" }]),
        ).toEqual([
            { id: "s", name: "Shop", kind: "SHOP", productCount: null },
        ]);
    });
});

describe("ownInBusiness", () => {
    it("leaves out a store whose business isn't known", () => {
        expect(ownInBusiness([{ id: "s", name: "Shop" }], "org_1")).toEqual([]);
    });
});

describe("locationLine", () => {
    it("says what a location is and how many products it sells", () => {
        expect(locationLine({ kind: "ONLINE", productCount: 12 })).toBe(
            "No counter · 12 products",
        );
        expect(locationLine({ kind: "SHOP", productCount: 1 })).toBe(
            "Customers visit · 1 product",
        );
        expect(locationLine({ kind: "SHOP", productCount: 0 })).toBe(
            "Customers visit · 0 products",
        );
    });

    it("says nothing it didn't read", () => {
        expect(locationLine({ kind: null, productCount: null })).toBeNull();
        expect(locationLine({ kind: "ONLINE", productCount: null })).toBe(
            "No counter",
        );
    });
});

describe("importChooserLead", () => {
    it("names the other location, or locations", () => {
        expect(importChooserLead(2)).toBe(
            "They'll be sold here. You can add them to your other location from each product.",
        );
        expect(importChooserLead(3)).toBe(
            "They'll be sold here. You can add them to your other locations from each product.",
        );
        expect(importChooserLead(1)).toBeNull();
    });
});

describe("canAddLocation", () => {
    it("asks store:create, and the role only of an API without permissions", () => {
        expect(canAddLocation({ actions: ["store:create"] })).toBe(true);
        expect(canAddLocation({ actions: ["store:read"], role: "ADMIN" })).toBe(
            false,
        );
        expect(canAddLocation({ role: "ADMIN" })).toBe(true);
        expect(canAddLocation({ role: "MEMBER" })).toBe(false);
        expect(canAddLocation(null)).toBe(false);
    });
});
