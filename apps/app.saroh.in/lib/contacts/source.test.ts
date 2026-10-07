import { describe, expect, it } from "vitest";

import { contactSourceLabel } from "./source";

describe("contactSourceLabel", () => {
    it.each([
        ["customers:added", "Added on Customers"],
        ["store-customer:cmumhl2ru00hm3tsgmpvmp1eo", "An order at a location"],
        ["enquiry:form:f_1", "An enquiry"],
        ["site-account", "Signed in on your website"],
        ["manual", "Added by hand"],
        // The contacts list drew these upper-cased (UX-051).
        ["MANUAL", "Added by hand"],
        ["SITE-ACCOUNT", "Signed in on your website"],
    ])("says %s in words", (source, words) => {
        expect(contactSourceLabel(source)).toBe(words);
    });

    it("never shows an id from an unknown key", () => {
        expect(contactSourceLabel("import:batch_9")).toBe("Import");
        expect(contactSourceLabel("walk_in")).toBe("Walk in");
    });
});
