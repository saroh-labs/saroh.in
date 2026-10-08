import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DuplicateSuggestion } from "@/lib/customer-workspace/service";

import { SamePersonPrompt } from "./same-person-prompt";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/customer-workspace/actions", () => ({
    mergeAction: vi.fn(),
    mergePreviewAction: vi.fn(),
}));
vi.mock("@saroh/ui/dialog", () => {
    const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
    return {
        Dialog: Pass,
        DialogContent: Pass,
        DialogTitle: Pass,
        DialogDescription: Pass,
    };
});

/**
 * "This may be the same person" on a contact's page (DEC-097): Merge for
 * whoever may merge, and their role named for whoever can't. Which
 * duplicates reach it is `shownDuplicates`' (merge.test.ts).
 */

const SAME_EMAIL: DuplicateSuggestion = {
    kind: "contact",
    contactId: "c_2",
    name: null,
    email: "priya@example.in",
    matchedOn: ["email"],
    signsIn: true,
};

describe("SamePersonPrompt", () => {
    it("names the other record and offers Merge", () => {
        const html = renderToStaticMarkup(
            <SamePersonPrompt
                contactId="c_1"
                duplicates={[SAME_EMAIL]}
                canMerge
            />,
        );
        expect(html).toContain("This may be the same person:");
        expect(html).toContain(
            "priya@example.in has the same email. They sign in on your website.",
        );
        expect(html).toContain("Merge…");
    });

    it("says their role can't merge, with no Merge, for one who can't", () => {
        const html = renderToStaticMarkup(
            <SamePersonPrompt
                contactId="c_1"
                duplicates={[SAME_EMAIL]}
                canMerge={false}
            />,
        );
        // The server escapes the apostrophe.
        expect(html).toMatch(/Your role can(&#x27;|')t merge them\./);
        expect(html).not.toContain("Merge…");
    });

    it("draws nothing with no same-email record", () => {
        expect(
            renderToStaticMarkup(
                <SamePersonPrompt contactId="c_1" duplicates={[]} canMerge />,
            ),
        ).toBe("");
    });
});
