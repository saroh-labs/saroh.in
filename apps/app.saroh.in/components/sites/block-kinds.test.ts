import { describe, expect, it } from "vitest";

import { addBlockGroups, BOUND_BLOCKS } from "./block-kinds";
import { SECTION_LABELS, SECTION_ORDER } from "./editor-constants";

describe("the Add block groups", () => {
    const every = Object.keys(SECTION_LABELS).sort();

    it("offers every block type the editor knows, once", () => {
        // A type missing from the order is a block nobody can add.
        expect([...SECTION_ORDER].sort()).toEqual(every);
        const { structure, business } = addBlockGroups(SECTION_ORDER);
        expect([...structure, ...business].sort()).toEqual(every);
    });

    it("puts a block under From your business exactly when it reads live data", () => {
        const { business } = addBlockGroups(SECTION_ORDER);
        expect(business).toEqual(
            SECTION_ORDER.filter((t) => BOUND_BLOCKS[t] !== null),
        );
        expect(business).toEqual(["booking", "servicesList"]);
    });
});
