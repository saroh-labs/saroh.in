import { describe, expect, it } from "vitest";

import { organizationLd } from "@/lib/structured-data";

import { SAROH_REPO_URL, SAROH_SOCIAL } from "./social";

describe("Saroh's accounts", () => {
    it("are https links, each once, with the public repo among them", () => {
        const hrefs = SAROH_SOCIAL.map((link) => link.href);
        for (const href of hrefs) expect(href).toMatch(/^https:\/\//);
        expect(new Set(hrefs).size).toBe(hrefs.length);
        expect(hrefs).toContain(SAROH_REPO_URL);
    });

    it("are the Organization's sameAs", () => {
        expect(organizationLd().sameAs).toEqual(
            SAROH_SOCIAL.map((link) => link.href),
        );
    });
});
