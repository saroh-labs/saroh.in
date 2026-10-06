import { describe, expect, it } from "vitest";

import { sentenceStart } from "./sentence";

describe("sentenceStart", () => {
    it("capitalises the fallback that opens a sentence", () => {
        expect(sentenceStart("the customer")).toBe("The customer");
    });

    it("leaves a name as it is", () => {
        expect(sentenceStart("Anika")).toBe("Anika");
        expect(sentenceStart("")).toBe("");
    });
});
