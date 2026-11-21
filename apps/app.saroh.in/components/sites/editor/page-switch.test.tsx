// @vitest-environment jsdom
/**
 * Opening another page of the site editor: a transition that greys the
 * canvas and inspector, and offline a "Couldn't load this page" in the
 * canvas instead of the browser's own error page.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { PageRegion, PageSwitchProvider, useOpenPageId } from "./page-switch";

let container: HTMLDivElement;
let root: Root;
function Opener() {
    const open = useOpenPageId("s1");
    return (
        <button type="button" onClick={() => open("p2")}>
            Open About
        </button>
    );
}
const button = (words: string) =>
    Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent.includes(words),
    );
const open = () => button("Open About")?.click();

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() =>
        root.render(
            <PageSwitchProvider siteId="s1">
                <Opener />
                <PageRegion shape="canvas">
                    <p>the canvas</p>
                </PageRegion>
            </PageSwitchProvider>,
        ),
    );
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    push.mockReset();
});

describe("PageSwitchProvider", () => {
    it("opens the page by its address", () => {
        act(() => open());
        expect(push).toHaveBeenCalledWith("/sites/s1?page=p2");
    });

    it("offline, says so in the canvas and tries again from there", () => {
        const online = vi.spyOn(navigator, "onLine", "get");
        online.mockReturnValue(false);
        act(() => open());
        expect(push).not.toHaveBeenCalled();
        expect(container.textContent).toContain("Couldn't load this page");
        expect(container.textContent).not.toContain("the canvas");

        online.mockReturnValue(true);
        act(() => button("Try again")?.click());
        expect(push).toHaveBeenCalledWith("/sites/s1?page=p2");
    });
});
