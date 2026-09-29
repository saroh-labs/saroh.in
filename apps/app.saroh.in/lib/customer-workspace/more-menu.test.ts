import { describe, expect, it } from "vitest";

import { DELETE_KEEPS_RECORDS, hasMoneyRecords, moreMenu } from "./more-menu";

describe("hasMoneyRecords (C11)", () => {
    it("is true with an order or an invoice", () => {
        expect(hasMoneyRecords({ stats: { orders: 2 }, invoices: null })).toBe(
            true,
        );
        expect(
            hasMoneyRecords({ stats: { orders: 0 }, invoices: { rows: [{}] } }),
        ).toBe(true);
    });

    it("is false only when both were read and are empty", () => {
        expect(
            hasMoneyRecords({ stats: { orders: 0 }, invoices: { rows: [] } }),
        ).toBe(false);
        expect(
            hasMoneyRecords({ stats: { orders: 0 }, invoices: null }),
        ).toBeUndefined();
        expect(
            hasMoneyRecords({ stats: {}, invoices: { rows: [] } }),
        ).toBeUndefined();
    });
});

/** Customer Detail's More menu, by role (C10). */

const go = {
    merge: () => undefined,
    link: () => undefined,
    notThem: () => undefined,
    remove: () => undefined,
};

const withRemove = { ...go, removeDetails: () => undefined };

const labels = (may: Parameters<typeof moreMenu>[0]) =>
    moreMenu(may, go).map((i) => i.label);

describe("moreMenu", () => {
    it("puts Merge first for an owner, then what editing allows", () => {
        expect(
            labels({
                canWrite: true,
                canMerge: true,
                canLink: true,
                canUnlink: true,
            }),
        ).toEqual([
            "Merge with a duplicate…",
            "Link a store customer…",
            "This isn't them…",
            "Delete their record…",
        ]);
    });

    it("shows no Merge without customer:merge", () => {
        expect(
            labels({
                canWrite: true,
                canMerge: false,
                canLink: false,
                canUnlink: false,
            }),
        ).toEqual(["Delete their record…"]);
    });

    it("keeps drawing the edit items for a reader, whose More is disabled", () => {
        expect(
            labels({
                canWrite: false,
                canMerge: false,
                canLink: true,
                canUnlink: false,
            }),
        ).toEqual(["Link a store customer…", "Delete their record…"]);
    });

    it("gives a role that may merge but not edit Merge alone", () => {
        expect(
            labels({
                canWrite: false,
                canMerge: true,
                canLink: true,
                canUnlink: true,
            }),
        ).toEqual(["Merge with a duplicate…"]);
    });

    it("ends with Remove their details for an owner, as the design has it (C11)", () => {
        expect(
            moreMenu(
                {
                    canWrite: true,
                    canMerge: true,
                    canRemove: true,
                    canLink: false,
                    canUnlink: false,
                    hasRecords: false,
                },
                withRemove,
            ).map((i) => i.label),
        ).toEqual([
            "Merge with a duplicate…",
            "Delete their record…",
            "Remove their details (privacy request)…",
        ]);
    });

    it("offers the privacy removal instead of Delete for someone with orders or invoices, keeping Delete off with its reason (C14)", () => {
        const items = moreMenu(
            {
                canWrite: true,
                canMerge: true,
                canRemove: true,
                canLink: true,
                canUnlink: false,
                hasRecords: true,
            },
            withRemove,
        );
        expect(items.map((i) => i.label)).toEqual([
            "Merge with a duplicate…",
            "Link a store customer…",
            "Delete their record…",
            "Remove their details (privacy request)…",
        ]);
        expect(
            items.filter((i) => i.danger && !i.disabled).map((i) => i.label),
        ).toEqual(["Remove their details (privacy request)…"]);
        expect(items.find((i) => i.label === "Delete their record…")).toEqual(
            expect.objectContaining({ disabled: DELETE_KEEPS_RECORDS }),
        );
    });

    it("keeps Delete for someone with orders when the viewer can't remove", () => {
        expect(
            moreMenu(
                {
                    canWrite: true,
                    canMerge: false,
                    canRemove: false,
                    canLink: false,
                    canUnlink: false,
                    hasRecords: true,
                },
                withRemove,
            ).map((i) => i.label),
        ).toEqual(["Delete their record…"]);
    });

    it("gives a role that may remove but not edit the removal alone", () => {
        expect(
            moreMenu(
                {
                    canWrite: false,
                    canMerge: false,
                    canRemove: true,
                    canLink: true,
                    canUnlink: true,
                },
                withRemove,
            ).map((i) => i.label),
        ).toEqual(["Remove their details (privacy request)…"]);
    });

    it("marks Delete as the dangerous one", () => {
        const items = moreMenu(
            {
                canWrite: true,
                canMerge: true,
                canLink: false,
                canUnlink: false,
            },
            go,
        );
        expect(items.filter((i) => i.danger).map((i) => i.label)).toEqual([
            "Delete their record…",
        ]);
    });
});
