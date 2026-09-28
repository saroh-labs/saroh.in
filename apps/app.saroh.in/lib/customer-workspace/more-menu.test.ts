import { describe, expect, it } from "vitest";

import { moreMenu } from "./more-menu";

/** Customer Detail's More menu, by role (C10). */

const go = {
    merge: () => undefined,
    link: () => undefined,
    notThem: () => undefined,
    remove: () => undefined,
};

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
