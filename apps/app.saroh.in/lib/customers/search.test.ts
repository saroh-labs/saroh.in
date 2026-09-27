import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api/http", () => ({
    apiFetch: (path: string) => apiFetch(path) as unknown,
    orgBase: () => Promise.resolve("/organizations/org_1"),
}));
const readAttention = vi.fn();
vi.mock("@/lib/services/peek-person", () => ({
    readAttention: (base: string, id: string) =>
        readAttention(base, id) as unknown,
}));

import type { CustomerSearchResult } from "@/lib/customers/picker";
import {
    addLabel,
    draftFromTyped,
    exactly,
    offerAdd,
    pickName,
    resultLabel,
} from "@/lib/customers/picker";
import { readCustomerAttention, searchCustomers } from "@/lib/customers/search";

const json = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
});

const PRIYA: CustomerSearchResult = {
    id: "c_1",
    name: "Priya Raman",
    email: "priya@example.com",
    phone: "+91 98765 43210",
    lastSeenAt: "2026-09-26T05:00:00.000Z",
    exactOn: [],
};

beforeEach(() => {
    apiFetch.mockReset();
    readAttention.mockReset();
});

describe("searchCustomers (E4)", () => {
    it("sends what was typed as it is, and asks for 8", async () => {
        apiFetch.mockResolvedValue(json(200, [PRIYA]));
        const read = await searchCustomers(" +91 98765 43210 ");
        // The app never normalises: the API does, with C2's rules.
        expect(apiFetch).toHaveBeenCalledWith(
            "/organizations/org_1/contacts/search?limit=8&q=%2B91+98765+43210",
        );
        expect(read).toEqual({ ok: true, results: [PRIYA] });
    });

    it("asks for the most recent when nothing is typed", async () => {
        apiFetch.mockResolvedValue(json(200, []));
        await searchCustomers("");
        expect(apiFetch).toHaveBeenCalledWith(
            "/organizations/org_1/contacts/search?limit=8",
        );
    });

    it("says a 403 is not allowed, so the picker offers only + Add", async () => {
        apiFetch.mockResolvedValue(json(403, {}));
        await expect(searchCustomers("pri")).resolves.toEqual({
            ok: false,
            forbidden: true,
        });
    });

    it("never reads a failure as nobody found", async () => {
        apiFetch.mockResolvedValue(json(500, {}));
        await expect(searchCustomers("pri")).resolves.toEqual({
            ok: false,
            forbidden: false,
        });
        apiFetch.mockRejectedValue(new Error("down"));
        await expect(searchCustomers("pri")).resolves.toEqual({
            ok: false,
            forbidden: false,
        });
        apiFetch.mockResolvedValue(json(200, { not: "a list" }));
        await expect(searchCustomers("pri")).resolves.toMatchObject({
            ok: false,
        });
    });

    it("reads a picked customer's Needs attention through C1's read", async () => {
        readAttention.mockResolvedValue({
            entries: [],
            hiddenSensitiveCount: 1,
        });
        await expect(readCustomerAttention("c_1")).resolves.toEqual({
            entries: [],
            hiddenSensitiveCount: 1,
        });
        expect(readAttention).toHaveBeenCalledWith(
            "/organizations/org_1",
            "c_1",
        );
    });
});

describe("the picker's rules (E4)", () => {
    it("puts what was typed in the field it belongs in", () => {
        expect(draftFromTyped("priya raman")).toEqual({
            name: "Priya Raman",
            phone: "",
            email: "",
        });
        expect(draftFromTyped("98765 43210")).toEqual({
            name: "",
            phone: "98765 43210",
            email: "",
        });
        expect(draftFromTyped(" priya@example.com ")).toEqual({
            name: "",
            phone: "",
            email: "priya@example.com",
        });
    });

    it("offers + Add from two characters, unless someone found has that name", () => {
        expect(offerAdd("p", [])).toBe(false);
        expect(offerAdd("pr", [])).toBe(true);
        expect(offerAdd("priya raman", [PRIYA])).toBe(false);
        expect(offerAdd("Priya", [PRIYA])).toBe(true);
        expect(addLabel(" Priya ")).toBe("+ Add “Priya” as a new customer");
    });

    it("finds the result that is exactly the email or phone typed", () => {
        const same = { ...PRIYA, exactOn: ["email" as const] };
        expect(exactly([PRIYA, same], "email")).toBe(same);
        expect(exactly([PRIYA], "phone")).toBeUndefined();
    });

    it("names someone by name, else email, else phone", () => {
        expect(resultLabel(PRIYA)).toBe("Priya Raman");
        expect(resultLabel({ ...PRIYA, name: null })).toBe("priya@example.com");
        expect(resultLabel({ name: null, email: null, phone: "98765" })).toBe(
            "98765",
        );
        expect(
            pickName({
                kind: "new",
                name: "",
                email: "new@example.com",
                phone: "",
            }),
        ).toBe("new@example.com");
    });
});
