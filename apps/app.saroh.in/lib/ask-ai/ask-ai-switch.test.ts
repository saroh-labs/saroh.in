import { describe, expect, it } from "vitest";

import { askAiOnFor } from "./ask-ai-switch";

/** Ask AI's screen switch: off unless NEXT_PUBLIC_ASK_AI says on. */
describe("askAiOnFor (NEXT_PUBLIC_ASK_AI)", () => {
    it("is off when unset in a built app, as production", () => {
        expect(askAiOnFor(undefined, "production")).toBe(false);
        expect(askAiOnFor(undefined, "test")).toBe(false);
    });

    it("is on only when it says on", () => {
        expect(askAiOnFor("on", "production")).toBe(true);
        expect(askAiOnFor("off", "production")).toBe(false);
    });

    it("unset counts as on under next dev, and off still hides there", () => {
        expect(askAiOnFor(undefined, "development")).toBe(true);
        expect(askAiOnFor("off", "development")).toBe(false);
    });
});
