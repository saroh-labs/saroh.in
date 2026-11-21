import { describe, expect, it } from "vitest";

import {
    defaultLeftOut,
    includesWaiting,
    mayInclude,
    publishLabel,
    withDependants,
} from "./leave-out";

const page = { key: "page:bridal", requires: [] };
const section = { key: "section:bridal:k1", requires: ["page:bridal"] };
const footer = { key: "site:footer", requires: [] };
const waiting = {
    key: "site:style",
    requires: [],
    approval: { state: "waiting" as const },
};
const approved = {
    key: "section:home:k2",
    requires: [],
    approval: { state: "approved" as const },
};

describe("Leave out (U11)", () => {
    it("takes a change's dependants with it, and ignores unknown keys", () => {
        expect(
            Array.from(
                withDependants(
                    [page, section, footer],
                    new Set(["page:bridal", "gone"]),
                ),
            ),
        ).toEqual(["page:bridal", "section:bridal:k1"]);
        expect(
            withDependants([page, section], new Set(["section:bridal:k1"])).has(
                "page:bridal",
            ),
        ).toBe(false);
    });

    it("leaves a waiting teammate's change out by default only while approval is needed", () => {
        const units = [footer, waiting, approved];
        expect(
            Array.from(defaultLeftOut({ units, approvalRequired: true })),
        ).toEqual(["site:style"]);
        expect(defaultLeftOut({ units, approvalRequired: false }).size).toBe(0);
        expect(defaultLeftOut(null).size).toBe(0);
    });

    it("lets only an owner include a change that waits for approval, as the override", () => {
        expect(mayInclude(waiting, true, false)).toBe(false);
        expect(mayInclude(waiting, true, true)).toBe(true);
        expect(mayInclude(approved, true, false)).toBe(true);
        expect(includesWaiting([waiting], new Set(), true)).toBe(true);
        expect(includesWaiting([waiting], new Set(["site:style"]), true)).toBe(
            false,
        );
    });

    it("says how many of how many go live", () => {
        expect(publishLabel(5, 4)).toBe("Publish 4 of 5 changes now");
        expect(publishLabel(5, 5)).toBe("Publish 5 changes now");
        expect(publishLabel(1, 1)).toBe("Publish 1 change now");
    });
});
