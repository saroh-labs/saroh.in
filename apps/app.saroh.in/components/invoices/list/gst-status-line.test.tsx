// @vitest-environment jsdom
/**
 * The Invoices list's one GST line (DEC-173, U8 #1120): what the papers
 * are, and how many things on sale have no GST rate, in one line whose
 * count opens the same rates sheet the notice opened. Someone who can't
 * set a rate reads the count with nothing to press.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stage } from "@/components/commerce/product-settings/test-kit";
import type { MissingRates } from "@/lib/gst-rates/missing";

import { GstStatusLine, gstWords } from "./gst-status-line";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/gst-rates/actions", () => ({ saveGstRates: vi.fn() }));
// The sheet has its own tests: here it is only whether it opens, on what.
vi.mock("@/components/gst-rates/gst-rates-sheet", () => ({
    GstRatesSheet: ({
        rows,
        title,
    }: {
        rows: { name: string }[] | null;
        title: string;
    }) =>
        rows ? (
            <div role="dialog" aria-label={title}>
                {rows.map((r) => r.name).join(", ")}
            </div>
        ) : null,
}));

const GOLD = {
    kind: "PLAN",
    id: "pl_1",
    name: "Gold monthly",
} as const;
const SILVER = { ...GOLD, id: "pl_2", name: "Silver monthly" } as const;
const missing = (
    items: MissingRates["items"],
    over: Partial<MissingRates> = {},
): MissingRates => ({ registered: true, items, more: false, ...over });

const REGISTERED = { registered: true, gstin: "29AAGCR4375J1ZU" };

const s = stage();
beforeEach(() => s.mount());
afterEach(() => s.unmount());

const line = () => document.querySelector("[data-gst-line]");

describe("GstStatusLine", () => {
    it("says the papers, the GSTIN and the missing rates as one line", () => {
        s.render(
            <GstStatusLine
                tax={REGISTERED}
                exempt={null}
                missing={missing([GOLD, SILVER])}
            />,
        );
        expect(line()?.textContent).toBe(
            "GST tax invoices · GSTIN 29AAGCR4375J1ZU · 2 plans need a GST rate",
        );
        // One line: no notice under it.
        expect(document.querySelectorAll("[data-gst-line]")).toHaveLength(1);
    });

    it("opens the rates sheet from the count", () => {
        s.render(
            <GstStatusLine
                tax={REGISTERED}
                exempt={null}
                missing={missing([GOLD, SILVER])}
            />,
        );
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        s.press("2 plans need a GST rate");
        const sheet = document.querySelector('[role="dialog"]');
        expect(sheet?.getAttribute("aria-label")).toBe("GST rates to choose");
        expect(sheet?.textContent).toBe("Gold monthly, Silver monthly");
    });

    it("reads the count with nothing to press to someone who can't set a rate", () => {
        s.render(
            <GstStatusLine
                tax={REGISTERED}
                exempt={null}
                missing={missing([{ ...GOLD, canSet: false }])}
            />,
        );
        expect(line()?.textContent).toContain("1 plan needs a GST rate");
        expect(line()?.querySelector("button")).toBeNull();
    });

    it("says nothing of rates when none is missing", () => {
        s.render(
            <GstStatusLine tax={REGISTERED} exempt={null} missing={null} />,
        );
        expect(line()?.textContent).toBe(
            "GST tax invoices · GSTIN 29AAGCR4375J1ZU",
        );
    });

    it("draws nothing when there is nothing to say", () => {
        s.render(<GstStatusLine tax={null} exempt={null} missing={null} />);
        expect(line()).toBeNull();
    });
});

describe("gstWords", () => {
    it("says what each business's papers are", () => {
        expect(gstWords({ registered: false, gstin: null }, null)).toBe(
            "Not GST-registered. No tax is charged.",
        );
        expect(gstWords({ registered: true, gstin: null }, null)).toBe(
            "GST tax invoices",
        );
        // Every issued paper a bill of supply (D15) says so instead.
        expect(gstWords(REGISTERED, "Exempt from GST.")).toBe(
            "Exempt from GST.",
        );
        expect(gstWords(null, null)).toBeNull();
    });
});
