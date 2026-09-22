import { describe, expect, it } from "vitest";

import { radixValue } from "@/components/shared/option-select";

const WITH_NONE = [
    { value: "", label: "None" },
    { value: "a", label: "A" },
];
const WITHOUT_NONE = [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
];

describe("OptionSelect's value", () => {
    it("shows the placeholder when nothing is chosen and there is no None row", () => {
        // Radix shows the placeholder only for "". Anything else picks a row,
        // and a row that does not exist renders as a blank trigger.
        expect(radixValue("", WITHOUT_NONE)).toBe("");
    });

    it("picks the None row when there is one", () => {
        expect(radixValue("", WITH_NONE)).toBe("__none__");
    });

    it("passes a real choice through", () => {
        expect(radixValue("b", WITHOUT_NONE)).toBe("b");
        expect(radixValue("a", WITH_NONE)).toBe("a");
    });
});
