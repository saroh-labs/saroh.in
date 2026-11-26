// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

// Next's view of the address, which can lag the real one: here it never
// moves, as when Next folds a tab's push and the Back after it together.
vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams("storefront=s1"),
}));

import { useTabParam } from "./use-tab-param";

let root: Root | null = null;
afterEach(() => {
    act(() => root?.unmount());
    root = null;
});

it("Back returns to the tab the address names, even when Next's search params never moved", () => {
    window.history.replaceState(null, "", "/commerce/locations?storefront=s1");
    let current = "";
    let choose: (k: "place" | "payments") => void = () => undefined;
    function Tabs() {
        const [tab, setTab] = useTabParam(
            "section",
            ["place", "payments"] as const,
            "place",
            { history: "push" },
        );
        current = tab;
        choose = setTab;
        return null;
    }
    const el = document.createElement("div");
    root = createRoot(el);
    act(() => root?.render(<Tabs />));
    expect(current).toBe("place");

    act(() => choose("payments"));
    expect(current).toBe("payments");
    expect(window.location.search).toContain("section=payments");

    // Back: the address loses ?section=, and the tab follows it.
    act(() => {
        window.history.replaceState(
            null,
            "",
            "/commerce/locations?storefront=s1",
        );
        window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(current).toBe("place");
});
