import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { paymentsLockedCopy } from "@/lib/invoices/access";
import { chipsFor } from "@/lib/invoices/sources";

import { PaymentsLocked } from "@/components/invoices/locked/payments-locked";
import { ScopeNotice, SourceFilter } from "./source-filter";

const noop = () => undefined;

describe("SourceFilter (D18)", () => {
    const chips = chipsFor(
        [
            { id: "a", source: "ORDER" as const },
            { id: "b", source: "PACK" as const },
        ],
        "PACK",
    );
    const html = renderToStaticMarkup(
        <SourceFilter chips={chips} chosen="PACK" onPick={noop} />,
    );

    it("is the list toolbar's one dropdown, named for what it narrows", () => {
        expect(html).toContain("data-list-filter");
        expect(html).toContain('role="combobox"');
        expect(html).toContain('aria-label="What it was for"');
        // A kind of invoice is not a status: no chips, no tabs.
        expect(html).not.toMatch(/role="(radio|tab)"/);
    });

    it("has the keyboard's focus ring and no width of its own", () => {
        expect(html).toContain("focus-visible:ring-2");
        expect(html).toContain("w-auto");
    });

    it("draws nothing when there is nothing to choose between", () => {
        expect(
            renderToStaticMarkup(
                <SourceFilter chips={[]} chosen="all" onPick={noop} />,
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

    it("is the one denial sentence, with the way back", () => {
        // The markup escapes an apostrophe, so the words are read around it.
        expect(html).toContain("open Payments<");
        expect(html).toContain("Your role is Member. It doesn");
        expect(html).toContain(
            "include Payments. An owner or admin can change this in Settings › Team.",
        );
        expect(html).not.toContain("money stays with owners and admins");
        expect(html).toContain("Back to Home");
        expect(html).toContain('href="/"');
    });

    it("is a denial, not a failure, and shows no code", () => {
        expect(html).not.toContain('role="alert"');
        expect(html).not.toContain("Try again");
        expect(html).not.toMatch(/UNAUTHORIZED|ROLLOUT_DISABLED|invoice:read/);
    });
});
