// @vitest-environment jsdom
/**
 * The one moment card: a title, one fact, at most one action, announced
 * politely, put away once for the whole business, still under reduced
 * motion.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Moment } from "@/components/shared/moment";
import type { MomentView } from "@/lib/moments/keys";

const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
}));

const markMomentSeen = vi.fn();
vi.mock("@/lib/moments/actions", () => ({
    markMomentSeen: (...args: unknown[]) => markMomentSeen(...args) as unknown,
}));

const FIRST_ORDER: MomentView = {
    key: "first-order",
    title: "Your first order",
    fact: "Asha Rao, ₹1,240.",
    action: { label: "Open order", href: "/commerce/orders/o1?storefront=s1" },
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    showError.mockReset();
    markMomentSeen.mockReset().mockResolvedValue({ ok: true, data: {} });
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

const render = (moment: MomentView = FIRST_ORDER) =>
    act(() => root.render(<Moment moment={moment} />));
const card = () => host.querySelector<HTMLElement>("[data-moment]");
const dismissButton = () => {
    const hit = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Dismiss"]',
    );
    if (!hit) throw new Error("No Dismiss button");
    return hit;
};
const press = (el: HTMLElement) =>
    act(async () => {
        el.click();
        await new Promise((r) => setTimeout(r, 0));
    });

describe("Moment", () => {
    it("says the title, the fact and the one next thing", () => {
        render();
        expect(card()?.textContent).toContain("Your first order");
        expect(card()?.textContent).toContain("Asha Rao, ₹1,240.");
        const link = host.querySelector("a");
        expect(link?.textContent).toBe("Open order");
        expect(link?.getAttribute("href")).toBe(
            "/commerce/orders/o1?storefront=s1",
        );
    });

    it("is announced politely and never as an alert", () => {
        render();
        expect(card()?.getAttribute("role")).toBe("status");
        expect(host.querySelector("[role=alert]")).toBeNull();
        // Its glyph is decoration: the words say it.
        expect(host.querySelector("[aria-hidden] svg")).not.toBeNull();
    });

    it("draws no action when the moment has none", () => {
        render({ ...FIRST_ORDER, action: undefined });
        expect(host.querySelector("a")).toBeNull();
        // Still dismissable.
        expect(dismissButton()).toBeTruthy();
    });

    it("enters on the motion tokens and stays still under reduced motion", () => {
        render();
        const classes = card()?.className ?? "";
        expect(classes).toContain("animate-in");
        expect(classes).toContain("fade-in-0");
        expect(classes).toContain("duration-slow");
        expect(classes).toContain("motion-reduce:animate-none");
        // Nothing that loops, bounces or draws the eye twice.
        expect(classes).not.toMatch(/animate-(pulse|bounce|ping|spin)/);
    });

    it("is put away once, for the whole business", async () => {
        render();
        await press(dismissButton());
        expect(card()).toBeNull();
        expect(markMomentSeen).toHaveBeenCalledTimes(1);
        expect(markMomentSeen).toHaveBeenCalledWith("first-order");
        expect(showError).not.toHaveBeenCalled();
    });

    it("comes back and says why when putting it away is refused", async () => {
        markMomentSeen.mockResolvedValue({
            ok: false,
            error: "Could not put that away.",
        });
        render();
        await press(dismissButton());
        expect(card()).not.toBeNull();
        expect(showError).toHaveBeenCalledWith("Could not put that away.");
    });

    it("comes back when the request never got there", async () => {
        markMomentSeen.mockRejectedValue(new Error("offline"));
        render();
        await press(dismissButton());
        expect(card()).not.toBeNull();
        // `runAction` says the one sentence for it.
        expect(showError).toHaveBeenCalledTimes(1);
    });

    it("counts following its action as seeing it", async () => {
        render();
        const link = host.querySelector<HTMLAnchorElement>("a");
        if (!link) throw new Error("No action");
        // jsdom doesn't navigate: stop the click after React has seen it.
        link.addEventListener("click", (e) => e.preventDefault());
        await press(link);
        expect(markMomentSeen).toHaveBeenCalledWith("first-order");
    });
});
