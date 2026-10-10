import { describe, expect, it } from "vitest";

import {
    countRows,
    finishedView,
    FOLD_KEY,
    nextFoldStage,
    orderRows,
    readFoldStage,
    unreadView,
    writeFoldStage,
} from "./setup-checklist";

/** The one checklist's rules (UX audit, 10 Oct). */

const row = (key: string, done: boolean) => ({ key, done });

function memory(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return {
        data,
        storage: () => ({
            getItem: (k: string) => data.get(k) ?? null,
            setItem: (k: string, v: string) => void data.set(k, v),
        }),
    };
}

describe("counts", () => {
    it("counts what is done, of how many", () => {
        expect(
            countRows([row("a", true), row("b", false), row("c", true)]),
        ).toEqual({ done: 2, total: 3, finished: false });
    });

    it("is finished only when every step is done", () => {
        expect(countRows([row("a", true), row("b", true)]).finished).toBe(true);
        expect(countRows([row("a", true), row("b", false)]).finished).toBe(
            false,
        );
    });
});

describe("order", () => {
    it("puts done steps first, then what is left, each in its own order", () => {
        expect(
            orderRows([
                row("address", false),
                row("payments", true),
                row("tax", false),
                row("site", true),
            ]).map((r) => r.key),
        ).toEqual(["payments", "site", "address", "tax"]);
    });

    it("leaves the list it was given alone", () => {
        const rows = [row("a", false), row("b", true)];
        orderRows(rows);
        expect(rows.map((r) => r.key)).toEqual(["a", "b"]);
    });
});

describe("finishing: the card, then one line, never gone in the same render", () => {
    it("shows the whole card on the visit that finds it done", () => {
        // Last seen with steps left.
        expect(finishedView("open", "keep")).toBe("finished");
        expect(finishedView("open", "once")).toBe("finished");
    });

    it("folds to one quiet line on the next visit", () => {
        expect(finishedView(1, "keep")).toBe("folded");
        expect(finishedView(1, "once")).toBe("folded");
    });

    it("keeps the line where it belongs, and lets it go on Home", () => {
        expect(finishedView(2, "keep")).toBe("folded");
        expect(finishedView(2, "once")).toBe("gone");
    });

    it("announces nothing to a browser that never saw steps left", () => {
        // A business that finished long ago, or a new browser.
        expect(finishedView(null, "keep")).toBe("folded");
        expect(finishedView(null, "once")).toBe("gone");
    });

    it("draws the settled state before the browser has answered", () => {
        expect(unreadView("keep")).toBe("folded");
        expect(unreadView("once")).toBe("gone");
    });

    it("moves on one visit at a time", () => {
        expect(nextFoldStage("open")).toBe(1);
        expect(nextFoldStage(1)).toBe(2);
        expect(nextFoldStage(2)).toBe(2);
        expect(nextFoldStage(null)).toBe(2);
    });
});

describe("which visit this is, kept in the browser", () => {
    it("remembers a stage per checklist", () => {
        const m = memory();
        expect(readFoldStage(m.storage, "home:org_1")).toBeNull();
        expect(writeFoldStage(m.storage, "home:org_1", "open")).toBe(true);
        expect(writeFoldStage(m.storage, "location:s_1", 1)).toBe(true);
        expect(readFoldStage(m.storage, "home:org_1")).toBe("open");
        expect(readFoldStage(m.storage, "location:s_1")).toBe(1);
        expect(JSON.parse(m.data.get(FOLD_KEY) ?? "{}")).toEqual({
            "home:org_1": "open",
            "location:s_1": 1,
        });
    });

    it("forgets a stage", () => {
        const m = memory();
        writeFoldStage(m.storage, "k", 2);
        writeFoldStage(m.storage, "k", null);
        expect(readFoldStage(m.storage, "k")).toBeNull();
    });

    it("reads a storage that refuses, or holds rubbish, as never seen", () => {
        const refuses = () => {
            throw new Error("blocked");
        };
        expect(readFoldStage(refuses, "k")).toBeNull();
        expect(writeFoldStage(refuses, "k", 1)).toBe(false);
        expect(
            readFoldStage(memory({ [FOLD_KEY]: "not json" }).storage, "k"),
        ).toBeNull();
        expect(
            readFoldStage(memory({ [FOLD_KEY]: '{"k":7}' }).storage, "k"),
        ).toBeNull();
        expect(
            readFoldStage(memory({ [FOLD_KEY]: "[1]" }).storage, "k"),
        ).toBeNull();
    });
});
