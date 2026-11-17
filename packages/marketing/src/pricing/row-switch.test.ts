import type { Catalog } from "@saroh/pricing-catalog";
import { describe, expect, it } from "vitest";

import { withoutSwitchedOff } from "./pricing-view";

const catalog = {
    modules: [{ id: "products" }, { id: "ask-ai" }, { id: "api-keys" }],
} as unknown as Catalog;
const ids = (c: Catalog) => c.modules.map((m) => m.id);

describe("withoutSwitchedOff: a plan never names an unlaunched feature", () => {
    it("drops Ask AI's and the API's rows while their switch is off, keeps the rest", () => {
        expect(ids(withoutSwitchedOff(catalog, ["ask-ai"]))).toEqual([
            "products",
            "api-keys",
        ]);
        expect(ids(withoutSwitchedOff(catalog, ["developers"]))).toEqual([
            "products",
            "ask-ai",
        ]);
        expect(ids(withoutSwitchedOff(catalog, []))).toEqual(ids(catalog));
    });
});
