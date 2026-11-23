// @vitest-environment jsdom
/**
 * Opening another page of the site editor: a transition that greys the
 * canvas and inspector, and offline a "Couldn't load this page" in the
 * canvas instead of the browser's own error page.
 */
import { act, Suspense, useEffect, useState } from "react";
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
        expect(container.textContent).toContain("Nothing you made is lost.");
        expect(container.textContent).not.toContain("the canvas");
        // Neutral, not red: a dropped connection (D5).
        expect(container.innerHTML).not.toContain("border-destructive");
        // The way back beside Try again (D5).
        expect(
            Array.from(container.querySelectorAll("a"))
                .find((a) => a.textContent === "Back to Website")
                ?.getAttribute("href"),
        ).toBe("/sites/s1/overview");

        online.mockReturnValue(true);
        act(() => button("Try again")?.click());
        expect(push).toHaveBeenCalledWith("/sites/s1?page=p2");
    });

    it("a fetch that fails while online is caught in the canvas; a second one loads in full", () => {
        const nav = new EventTarget();
        vi.stubGlobal("navigation", nav);
        // Next's fallback: a full load of the page it couldn't fetch.
        const fullLoad = () => {
            const e = new Event("navigate", { cancelable: true });
            Object.assign(e, {
                navigationType: "push",
                destination: {
                    url: new URL("/sites/s1?page=p2", location.origin).href,
                    sameDocument: false,
                },
            });
            act(() => {
                nav.dispatchEvent(e);
            });
            return e.defaultPrevented;
        };
        // The navigation stays in flight, as a real fetch does: the
        // transition suspends on a page that never comes.
        const stall: { current: (on: boolean) => void } = {
            current: () => undefined,
        };
        const never = new Promise<never>(() => undefined);
        function Page() {
            const [stalled, set] = useState(false);
            useEffect(() => {
                stall.current = set;
            }, []);
            // eslint-disable-next-line @typescript-eslint/only-throw-error -- how a page suspends
            if (stalled) throw never;
            return null;
        }
        act(() =>
            root.render(
                <PageSwitchProvider siteId="s1">
                    <Opener />
                    <Suspense fallback={null}>
                        <Page />
                    </Suspense>
                    <PageRegion shape="canvas">
                        <p>the canvas</p>
                    </PageRegion>
                </PageSwitchProvider>,
            ),
        );
        push.mockImplementation(() => stall.current(true));
        vi.useFakeTimers();
        act(() => open());
        expect(fullLoad()).toBe(true);
        act(() => {
            vi.runAllTimers();
        });
        vi.useRealTimers();
        expect(container.textContent).toContain("Couldn't load this page");
        expect(container.textContent).not.toContain("the canvas");

        act(() => button("Try again")?.click());
        expect(push).toHaveBeenCalledTimes(2);
        // Tried once in place: now a sign-in or a new deploy gets through.
        expect(fullLoad()).toBe(false);
        vi.unstubAllGlobals();
    });
});
