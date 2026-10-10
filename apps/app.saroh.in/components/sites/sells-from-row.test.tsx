// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SHOP_AWAITS_SELLS_FROM } from "@/lib/sites/sells-from";
import type { SellsFrom } from "@/lib/sites/service";

import { SELLS_FROM_QUESTION, SellsFromRow } from "./sells-from-row";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh }),
}));
const update = vi.fn();
vi.mock("@/lib/sites/actions", () => ({
    updateSiteSettings: (...args: unknown[]) => update(...args) as unknown,
}));
const showError = vi.fn();
const showSuccess = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
}));

/**
 * The site's Shop settings (G11, P4): while the shop could serve but Sells
 * from is unanswered, the section says its shop page isn't live, and the
 * readiness step's link lands on it (`#sells-from`).
 *
 * Read first (owner, 10 Oct): the row says what is saved, and Change or
 * Choose opens the question in a side sheet with one Save.
 */

const online = { id: "st_1", name: "Online", products: 4 };
const hill = { id: "st_2", name: "Hill Road", products: 1 };

const row = (sellsFrom: SellsFrom, awaiting?: boolean) =>
    renderToStaticMarkup(
        <SellsFromRow
            siteId="site_1"
            sellsFrom={sellsFrom}
            canChange
            awaiting={awaiting}
        />,
    );

describe("SellsFromRow (P4)", () => {
    it("says the shop page isn't live while it waits on the answer", () => {
        const html = row({ storefront: null, choices: [online, hill] }, true);
        expect(html).toContain('id="sells-from"');
        expect(html).toContain("Not live");
        expect(html).toContain(
            SHOP_AWAITS_SELLS_FROM.replaceAll("'", "&#x27;"),
        );
        // The row says it isn't chosen, with the way to choose; the
        // question waits in its sheet, not in the row.
        expect(html).toContain("Not chosen yet.");
        expect(html).toContain(">Choose</button>");
        expect(html).not.toContain(SELLS_FROM_QUESTION);
        expect(html).not.toMatch(/<input|role="radio"/);
    });

    it("reads 'Your online shop sells from' once answered (DEC-069, L12)", () => {
        const html = row({ storefront: online, choices: [online, hill] });
        expect(html).toContain("Your online shop sells from Online");
        expect(html).toContain("Your online shop");
        expect(html).toContain(">Change</button>");
        expect(html).not.toMatch(/storefront/i);
    });

    it("says nothing more once it is answered, or when the API doesn't say", () => {
        for (const html of [
            row({ storefront: online, choices: [online, hill] }, true),
            row({ storefront: null, choices: [online, hill] }),
        ]) {
            expect(html).not.toContain("Not live");
            expect(html).not.toContain("your shop page isn");
        }
    });

    it("offers nothing to press without a location that sells, or the permission", () => {
        expect(row({ storefront: null, choices: [] })).not.toContain("<button");
        const read = renderToStaticMarkup(
            <SellsFromRow
                siteId="site_1"
                sellsFrom={{ storefront: null, choices: [online, hill] }}
                canChange={false}
            />,
        );
        expect(read).not.toContain("<button");
        expect(read).toContain(
            "Someone who can change the site&#x27;s settings can pick it.",
        );
    });
});

describe("the Sells from sheet", () => {
    let root: Root;
    let host: HTMLDivElement;

    beforeEach(() => {
        (
            globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
        ).IS_REACT_ACT_ENVIRONMENT = true;
        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe = vi.fn();
                unobserve = vi.fn();
                disconnect = vi.fn();
            },
        );
        host = document.createElement("div");
        document.body.appendChild(host);
        root = createRoot(host);
        update.mockReset();
        showError.mockReset();
        showSuccess.mockReset();
        refresh.mockReset();
        update.mockResolvedValue({ ok: true });
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    function draw(sellsFrom: SellsFrom) {
        act(() =>
            root.render(
                <SellsFromRow
                    siteId="site_1"
                    sellsFrom={sellsFrom}
                    canChange
                />,
            ),
        );
    }

    const item = (name: string) =>
        Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
            (b) => b.textContent === name,
        );
    const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]');
    const says = () =>
        host.querySelector('[data-testid="sells-from-summary"]')?.textContent;
    const choice = (name: string) =>
        Array.from(
            sheet()?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ??
                [],
        ).find((r) => r.closest("label")?.textContent.startsWith(name));

    async function press(button: HTMLElement | null | undefined) {
        if (!button) throw new Error("Nothing to press");
        await act(async () => {
            button.click();
            await Promise.resolve();
        });
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }

    it("Change opens the question on the saved location; Save sends the pick and the row says it", async () => {
        draw({ storefront: online, choices: [online, hill] });
        expect(sheet()).toBeNull();
        await press(item("Change"));
        expect(sheet()?.textContent).toContain(SELLS_FROM_QUESTION);
        expect(choice("Online")?.getAttribute("aria-checked")).toBe("true");
        expect(sheet()?.textContent).toContain("1 product");
        await press(choice("Hill Road"));
        expect(update).not.toHaveBeenCalled();
        expect(says()).toBe("Your online shop sells from Online");

        await press(item("Save"));
        expect(update).toHaveBeenCalledWith("site_1", {
            storefrontId: "st_2",
        });
        expect(showSuccess).toHaveBeenCalledWith(
            "Your online shop now sells from Hill Road.",
        );
        expect(sheet()).toBeNull();
        expect(says()).toBe("Your online shop sells from Hill Road");
    });

    it("Cancel saves nothing, and the next opening starts from what is saved", async () => {
        draw({ storefront: online, choices: [online, hill] });
        await press(item("Change"));
        await press(choice("Hill Road"));
        await press(item("Cancel"));
        expect(update).not.toHaveBeenCalled();
        expect(sheet()).toBeNull();
        expect(says()).toBe("Your online shop sells from Online");
        expect(document.activeElement).toBe(item("Change"));
        await press(item("Change"));
        expect(choice("Online")?.getAttribute("aria-checked")).toBe("true");
    });

    it("a refusal keeps the sheet open with the pick, and the row as it was", async () => {
        update.mockResolvedValue({
            ok: false,
            error: "That location no longer sells anything.",
        });
        draw({ storefront: online, choices: [online, hill] });
        await press(item("Change"));
        await press(choice("Hill Road"));
        await press(item("Save"));
        expect(showError).toHaveBeenCalledWith(
            "That location no longer sells anything.",
        );
        expect(choice("Hill Road")?.getAttribute("aria-checked")).toBe("true");
        expect(says()).toBe("Your online shop sells from Online");
    });

    it("unanswered, Choose opens it with nothing picked, and Save asks for one", async () => {
        draw({ storefront: null, choices: [online, hill] });
        await press(item("Choose"));
        await press(item("Save"));
        expect(update).not.toHaveBeenCalled();
        expect(sheet()?.querySelector('[role="alert"]')?.textContent).toBe(
            "Choose a location",
        );
    });
});
