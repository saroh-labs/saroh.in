import { describe, expect, it } from "vitest";

import { firstStageWithLeads, stageAnchor } from "./pipeline-board";

const stages = [{ id: "new" }, { id: "contacted" }, { id: "won" }];

describe("firstStageWithLeads (UX-077)", () => {
    it("opens on the first stage that holds a lead", () => {
        expect(
            firstStageWithLeads(
                stages,
                new Map([
                    ["new", 0],
                    ["contacted", 1],
                    ["won", 3],
                ]),
            ),
        ).toBe("contacted");
    });

    it("opens at the start when every stage is empty", () => {
        expect(firstStageWithLeads(stages, new Map())).toBeNull();
    });

    it("names a column the stage list can link to", () => {
        expect(stageAnchor("won")).toBe("stage-won");
    });
});
