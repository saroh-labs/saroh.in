jest.mock("../../env", () => ({ env: {}, declaredNodeEnv: "test" }));

import {
    FREE_BUSINESS_TAKEN_MESSAGE,
    freeBusinessTakenMessage,
} from "./free-business";

describe("the second Free business refusal (P6)", () => {
    it("points India at a paid plan and Global, which has none, at closing", () => {
        expect(freeBusinessTakenMessage("INDIA")).toBe(
            FREE_BUSINESS_TAKEN_MESSAGE,
        );
        const global = freeBusinessTakenMessage("GLOBAL");
        expect(global).not.toContain("paid plan");
        expect(global).toContain("Close that one");
    });
});
