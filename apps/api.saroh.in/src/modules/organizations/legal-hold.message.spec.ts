import { editionProfile } from "@saroh/edition";

import { LEGAL_HOLD_MESSAGE, legalHoldRefusal } from "./legal-hold";

describe("legal hold refusal names the edition's own address", () => {
    it("India keeps its wording; Global names its own address", () => {
        expect(legalHoldRefusal("INDIA").message).toBe(LEGAL_HOLD_MESSAGE);
        expect(legalHoldRefusal().message).toBe(LEGAL_HOLD_MESSAGE);
        const global = legalHoldRefusal("GLOBAL").message;
        expect(global).toContain(editionProfile("GLOBAL").supportEmail);
        expect(global).not.toContain(editionProfile("INDIA").supportEmail);
    });
});
