import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AttentionTags } from "./attention-tags";

/**
 * The tags Customer Detail and the Customers list share (C5): each says its
 * kind in words, and what a role can't see is a count, never its words.
 */
const text = (html: string) =>
    html
        .replace(/<[^>]+>/g, "|")
        .split("|")
        .map((s) => s.replace(/&#x27;/g, "'").trim())
        .filter(Boolean);

describe("AttentionTags", () => {
    it("draws each tag in words", () => {
        const html = renderToStaticMarkup(
            <AttentionTags
                tags={[
                    { kind: "ALLERGY", label: "Latex" },
                    { kind: "MEDICAL", label: "Blood thinners" },
                ]}
            />,
        );
        expect(text(html)).toEqual([
            "Allergy: Latex",
            "Medical: Blood thinners",
        ]);
        expect(html).toContain("bg-destructive-subtle");
    });

    it("says what a Member can't see in place of the Medical tag", () => {
        const html = renderToStaticMarkup(
            <AttentionTags
                tags={[{ kind: "ALLERGY", label: "Latex" }]}
                hiddenCount={1}
            />,
        );
        expect(text(html)).toEqual([
            "Allergy: Latex",
            "1 more note you can't see",
        ]);
        expect(html).not.toContain("Blood thinners");
    });

    it("says it without 'more' when nothing is shown", () => {
        const html = renderToStaticMarkup(
            <AttentionTags tags={[]} hiddenCount={1} size="header" />,
        );
        expect(text(html)).toEqual(["1 note you can't see"]);
    });

    it("draws nothing for nothing", () => {
        expect(renderToStaticMarkup(<AttentionTags tags={[]} />)).toBe("");
    });

    it("carries the header's title and warning mark", () => {
        const html = renderToStaticMarkup(
            <AttentionTags
                size="header"
                tags={[
                    {
                        id: "a",
                        kind: "ACCESS",
                        label: "Anxious patient",
                        title: "Explain each step before starting",
                    },
                ]}
            />,
        );
        expect(html).toContain('title="Explain each step before starting"');
        expect(html).toContain("<svg");
    });
});
