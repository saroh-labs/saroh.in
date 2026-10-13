/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ReferredBy } from "./referred-by";

afterEach(cleanup);

/**
 * "Referred by" on a business's page (DEC-156): the referring business by
 * name, linked to its own page, and the day it was recorded. Nothing about
 * what a referral is worth.
 */
describe("ReferredBy", () => {
    it("names the referring business, links to its page and says when", () => {
        const { container } = render(
            <ReferredBy
                referredBy={{
                    id: "org_rye",
                    name: "Rye and Co",
                    at: "2026-10-17T10:30:00.000Z",
                }}
            />,
        );

        const link = screen.getByRole("link", { name: "Rye and Co" });
        expect(link.getAttribute("href")).toBe("/businesses/org_rye");
        expect(container.textContent).toMatch(
            /^Rye and Co, recorded .*17.*2026/,
        );
    });

    it("says only the business when no day was recorded", () => {
        const { container } = render(
            <ReferredBy
                referredBy={{ id: "org_rye", name: "Rye and Co", at: null }}
            />,
        );

        expect(container.textContent).toBe("Rye and Co");
    });

    it("says nothing of credit, rewards or amounts", () => {
        const { container } = render(
            <ReferredBy
                referredBy={{
                    id: "org_rye",
                    name: "Rye and Co",
                    at: "2026-10-17T10:30:00.000Z",
                }}
            />,
        );

        expect(container.textContent).not.toMatch(/credit|reward|earn|%|₹/i);
    });
});
