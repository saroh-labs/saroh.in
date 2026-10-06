import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LimitNoticeBlock } from "./limit-notice";

const props = {
    title: "You've reached your 5 GB of things on Plan A",
    pct: "100%",
    body: "Nothing is blocked.",
    cta: "Add more",
    href: "/settings/billing",
};

describe("LimitNoticeBlock", () => {
    it("tints a hard cap at 100% as a refusal", () => {
        const html = renderToStaticMarkup(<LimitNoticeBlock full {...props} />);
        expect(html).toContain("bg-destructive-subtle");
    });

    it("keeps a soft cap at 100% informational, never the refusal tint", () => {
        const html = renderToStaticMarkup(
            <LimitNoticeBlock full soft {...props} />,
        );
        expect(html).not.toContain("destructive");
        expect(html).toContain("bg-brand-subtle");
        expect(html).toContain('role="status"');
    });
});
