// @vitest-environment jsdom
/**
 * The Service Editor's Price card, "GST on this price" (12 Oct 2026): a
 * GST-registered business can price one service differently from its usual
 * way. The select is not drawn for a business that isn't registered; its
 * first option says what the business's own way is; and a change goes into
 * the draft the page saves, null for "same as the business".
 *
 * `react-dom/client` + `act` directly, as the editor's tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GstPriceMode } from "@/lib/gst/price-mode";
import type {
    ServiceCharged,
    ServiceDraft,
} from "@/lib/services/service-editor";
import { draftOf, serviceInput } from "@/lib/services/service-editor";

import { PriceSection } from "./editor-sections";

// A native select stands in for the product's, which opens a portal.
vi.mock("@saroh/ui/option-select", () => ({
    OptionSelect: ({
        value,
        onValueChange,
        options,
        disabled,
    }: {
        value: string;
        onValueChange: (v: string) => void;
        options: { value: string; label: string }[];
        disabled?: boolean;
    }) => (
        <select
            value={value}
            disabled={disabled}
            onChange={(e) => onValueChange(e.target.value)}
        >
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    ),
}));

let root: Root;
let host: HTMLDivElement;
let draft: ServiceDraft;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    draft = {
        ...draftOf(null, [], "Asia/Kolkata"),
        price: "1000",
        gstRate: "18",
        deposit: "PERCENT_50",
    };
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

interface Page {
    withGst?: boolean;
    businessPriceMode?: GstPriceMode | null;
    charged?: ServiceCharged | null;
    canEdit?: boolean;
}

function render(page: Page = {}) {
    const { withGst = true, businessPriceMode = "INCLUDED" } = page;
    const draw = () =>
        root.render(
            <PriceSection
                draft={draft}
                set={(patch) => {
                    draft = { ...draft, ...patch };
                    draw();
                }}
                problem={() => null}
                leave={() => undefined}
                currency="INR"
                payment={{ bookingPayment: "BOTH", onlineBlocker: null }}
                withGst={withGst}
                businessPriceMode={businessPriceMode}
                charged={page.charged ?? null}
                canEdit={page.canEdit ?? true}
            />,
        );
    act(draw);
}

/** The field with this label, and the select inside it. */
function modeSelect(): HTMLSelectElement | null {
    const label = Array.from(host.querySelectorAll("label")).find(
        (l) => l.textContent.trim() === "GST on this price",
    );
    const id = label?.getAttribute("for");
    const byId = id ? document.getElementById(id) : null;
    if (byId instanceof HTMLSelectElement) return byId;
    return label?.parentElement?.querySelector("select") ?? null;
}

function choose(value: string) {
    const box = modeSelect();
    if (!box) throw new Error("No GST on this price select");
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            "value",
        )?.set?.call(box, value);
        box.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

const labels = () =>
    Array.from(modeSelect()?.options ?? []).map((o) => o.textContent);

describe("GST on this price", () => {
    it("is not drawn for a business that isn't registered, and nothing is said of GST", () => {
        render({ withGst: false, businessPriceMode: null });
        expect(modeSelect()).toBeNull();
        expect(host.textContent).not.toContain("GST");
    });

    it("says what the business's own way is in its first option", () => {
        render({ businessPriceMode: "INCLUDED" });
        expect(labels()).toEqual([
            "Same as the business (includes GST)",
            "Includes GST",
            "GST is added",
        ]);
        expect(modeSelect()?.value).toBe("");
        render({ businessPriceMode: "ADDED" });
        expect(labels()[0]).toBe("Same as the business (GST is added)");
        // Couldn't be read: no claim either way.
        render({ businessPriceMode: null });
        expect(labels()[0]).toBe("Same as the business");
    });

    it("a change goes into what the page saves: ADDED, INCLUDED, then null for the business's way", () => {
        render();
        const sent = () => serviceInput(draft, "INR").gstPriceMode;
        expect(sent()).toBeNull();
        choose("ADDED");
        expect(sent()).toBe("ADDED");
        expect(modeSelect()?.value).toBe("ADDED");
        choose("INCLUDED");
        expect(sent()).toBe("INCLUDED");
        choose("");
        expect(sent()).toBeNull();
    });

    it("is off for someone who can't change services", () => {
        render({ canEdit: false });
        expect(modeSelect()?.disabled).toBe(true);
    });

    it("the rate's note says the rate goes on top only when it does", () => {
        render({ businessPriceMode: "INCLUDED" });
        expect(host.textContent).toContain(
            "The rate the price includes. It isn't added on top.",
        );
        choose("ADDED");
        expect(host.textContent).toContain(
            "The rate added on top of the price.",
        );
        expect(host.textContent).not.toContain("It isn't added on top.");
    });
});

describe("what customers pay, under the deposit", () => {
    it("is the API's amount while the price is as saved", () => {
        draft = { ...draft, gstPriceMode: "ADDED" };
        render({ charged: { payCents: 118_000, depositCents: 59_000 } });
        expect(host.textContent).toContain(
            "They pay ₹590 when booking, and the rest (₹590) at the visit.",
        );
    });

    it("is said in words once GST goes on top of a price that isn't saved yet", () => {
        render({ businessPriceMode: "ADDED" });
        expect(host.textContent).toContain(
            "They pay 50% of the price plus GST when booking, and the rest at the visit.",
        );
        // Never the typed price as if it were the amount to pay.
        expect(host.textContent).not.toContain("₹500");
    });

    it("is the typed price's split when the price includes its GST", () => {
        render({ businessPriceMode: "INCLUDED" });
        expect(host.textContent).toContain(
            "They pay ₹500 when booking, and the rest (₹500) at the visit.",
        );
    });
});
