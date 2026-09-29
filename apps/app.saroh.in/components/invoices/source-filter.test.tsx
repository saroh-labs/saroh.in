import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { paymentsLockedCopy } from "@/lib/invoices/access";
import { chipsFor } from "@/lib/invoices/sources";

import { PaymentsLocked } from "./payments-locked";
import { ScopeNotice, SourceChips } from "./source-filter";

const noop = () => undefined;

describe("SourceChips (D18)", () => {
    const chips = chipsFor(
        [
            { id: "a", source: "ORDER" as const },
            { id: "b", source: "PACK" as const },
        ],
        "PACK",
    );
    const html = renderToStaticMarkup(
        <SourceChips chips={chips} chosen="PACK" onPick={noop} />,
    );

    it("is a named radio group with the chosen chip checked", () => {
        expect(html).toContain('role="radiogroup"');
        expect(html).toContain('aria-label="What it was for"');
        expect(html).toMatch(/aria-checked="true"[^>]*>Packs</);
        expect(html).toMatch(/aria-checked="false"[^>]*>Orders</);
    });

    it("every chip is a button with focus, hover and pressed states", () => {
        expect(html.match(/<button/g)).toHaveLength(3);
        expect(html).toContain("focus-visible:ring-2");
        expect(html).toContain("hover:");
        expect(html).toContain("active:");
    });

    it("draws nothing when there is nothing to choose between", () => {
        expect(
            renderToStaticMarkup(
                <SourceChips chips={[]} chosen="all" onPick={noop} />,
            ),
        ).toBe("");
    });
});

describe("ScopeNotice", () => {
    const html = renderToStaticMarkup(
        <ScopeNotice
            line="Showing 3 for Morning pack"
            clearHref="/billing/invoices"
        />,
    );

    it("says the list is narrowed, and offers the whole list back", () => {
        expect(html).toContain("Showing 3 for Morning pack");
        expect(html).toContain('href="/billing/invoices"');
        expect(html).toContain("Show all invoices");
        expect(html).toContain("focus-visible:ring-2");
    });
});

describe("PaymentsLocked", () => {
    const html = renderToStaticMarkup(
        <PaymentsLocked
            {...paymentsLockedCopy({ role: "MEMBER", roleKey: "MEMBER" })}
        />,
    );

    it("is the design's card, in the merchant's words, with the way back", () => {
        expect(html).toContain("Only owners and admins see payments");
        expect(html).toContain("money stays with owners and admins");
        expect(html).toContain("Back to Home");
        expect(html).toContain('href="/"');
    });

    it("is a denial, not a failure, and shows no code", () => {
        expect(html).not.toContain('role="alert"');
        expect(html).not.toContain("Try again");
        expect(html).not.toMatch(/UNAUTHORIZED|ROLLOUT_DISABLED|invoice:read/);
    });
});
