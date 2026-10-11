// @vitest-environment jsdom
/**
 * `useLiveRefresh` and the tab title, mounted as the shell mounts them: the
 * page reads again when the tab is come back to, when the connection
 * returns, and every 45 seconds on a watched page. Never under a dialog,
 * unsaved work, a hidden tab, or a refresh still on its way.
 */
import type * as ReactModule from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const nav = { pathname: "/commerce/orders" };
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
    usePathname: () => nav.pathname,
}));

// A refresh "on its way": what `useTransition` says while the server reads.
const transition = { pending: false };
vi.mock("react", async (original) => {
    const actual = await original<typeof ReactModule>();
    return {
        ...actual,
        useTransition: () =>
            [transition.pending, (run: () => void) => run()] as const,
    };
});

const setErrorAction = vi.fn(() => () => undefined);
vi.mock("@saroh/ui/toast", () => ({
    setErrorAction: (...a: unknown[]) =>
        (setErrorAction as (...x: unknown[]) => () => void)(...a),
}));
vi.mock("@/lib/accounts", () => ({
    accountsLoginUrl: "https://accounts.test/login",
}));

import { SIGNED_OUT } from "@/lib/api/unreached";
import { holdLiveRefresh } from "@/lib/live/refresh";

import { LiveRefresh } from "./live-refresh";

let root: Root;
let host: HTMLDivElement;
let visibility: DocumentVisibilityState = "visible";
let online = true;

function mount(unread: number | null = 0) {
    act(() => root.render(<LiveRefresh unread={unread} />));
}

function comeBack() {
    visibility = "visible";
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
}

function wait(ms: number) {
    act(() => void vi.advanceTimersByTime(ms));
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T09:00:00.000Z"));
    refresh.mockReset();
    setErrorAction.mockClear();
    nav.pathname = "/commerce/orders";
    transition.pending = false;
    visibility = "visible";
    online = true;
    Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => visibility,
    });
    Object.defineProperty(navigator, "onLine", {
        configurable: true,
        get: () => online,
    });
    document.title = "Orders · Saroh";
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.useRealTimers();
});

describe("useLiveRefresh", () => {
    it("reads the page again when the tab is come back to", () => {
        mount();
        expect(refresh).not.toHaveBeenCalled();
        visibility = "hidden";
        act(() => void document.dispatchEvent(new Event("visibilitychange")));
        expect(refresh).not.toHaveBeenCalled();
        comeBack();
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("reads it again when the connection returns", () => {
        mount();
        online = false;
        act(() => void window.dispatchEvent(new Event("offline")));
        online = true;
        act(() => void window.dispatchEvent(new Event("online")));
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("reads it again every 45 seconds on a watched page", () => {
        mount();
        wait(44_000);
        expect(refresh).not.toHaveBeenCalled();
        wait(1_000);
        expect(refresh).toHaveBeenCalledTimes(1);
        wait(45_000);
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it.each(["/", "/bookings", "/bookings/all", "/notifications"])(
        "%s is watched too",
        (pathname) => {
            nav.pathname = pathname;
            mount();
            wait(45_000);
            expect(refresh).toHaveBeenCalledTimes(1);
        },
    );

    it("keeps no timer on any other page, but still reads again on coming back", () => {
        nav.pathname = "/commerce/products/p_1/edit";
        mount();
        wait(5 * 45_000);
        expect(refresh).not.toHaveBeenCalled();
        comeBack();
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("waits while the tab is hidden", () => {
        mount();
        visibility = "hidden";
        wait(3 * 45_000);
        expect(refresh).not.toHaveBeenCalled();
    });

    it("waits while the browser is offline", () => {
        mount();
        online = false;
        wait(45_000);
        comeBack();
        expect(refresh).not.toHaveBeenCalled();
    });

    it("waits while a sheet or a dialog is open, and goes on once it closes", () => {
        mount();
        const dialog = document.createElement("div");
        dialog.setAttribute("role", "dialog");
        document.body.append(dialog);
        wait(45_000);
        comeBack();
        expect(refresh).not.toHaveBeenCalled();

        dialog.remove();
        wait(45_000);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("waits under a confirm too", () => {
        mount();
        const confirm = document.createElement("div");
        confirm.setAttribute("role", "alertdialog");
        document.body.append(confirm);
        wait(45_000);
        expect(refresh).not.toHaveBeenCalled();
    });

    it("waits while a screen holds unsaved work (the leave guard's signal)", () => {
        mount();
        const release = holdLiveRefresh();
        wait(45_000);
        comeBack();
        expect(refresh).not.toHaveBeenCalled();
        release();
        wait(45_000);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("waits once a form on the page is typed into, until it is sent", () => {
        mount();
        const form = document.createElement("form");
        const field = document.createElement("input");
        form.append(field);
        document.body.append(form);
        act(() => {
            field.value = "Asha";
            field.dispatchEvent(new Event("input", { bubbles: true }));
        });
        wait(45_000);
        expect(refresh).not.toHaveBeenCalled();

        act(() => {
            form.dispatchEvent(
                new Event("submit", { bubbles: true, cancelable: true }),
            );
        });
        wait(45_000);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("a search box typed into holds nothing: the list still reads again", () => {
        mount();
        const form = document.createElement("form");
        const search = document.createElement("input");
        search.type = "search";
        form.append(search);
        document.body.append(form);
        act(() => {
            search.value = "ORD-00";
            search.dispatchEvent(new Event("input", { bubbles: true }));
        });
        wait(45_000);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("waits while someone is typing in a field", () => {
        mount();
        const field = document.createElement("textarea");
        document.body.append(field);
        field.focus();
        wait(45_000);
        expect(refresh).not.toHaveBeenCalled();
        field.blur();
        wait(45_000);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("never starts a second refresh while one is on its way", () => {
        mount();
        wait(45_000);
        expect(refresh).toHaveBeenCalledTimes(1);
        // The server is still reading.
        transition.pending = true;
        mount();
        wait(45_000);
        comeBack();
        act(() => void window.dispatchEvent(new Event("online")));
        expect(refresh).toHaveBeenCalledTimes(1);
        // It landed: the next tick reads again.
        transition.pending = false;
        mount();
        wait(45_000);
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("coming back and coming online in the same moment is one refresh", () => {
        mount();
        comeBack();
        act(() => void window.dispatchEvent(new Event("online")));
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("stops listening when the shell goes", () => {
        mount();
        act(() => root.unmount());
        root = createRoot(host);
        visibility = "visible";
        document.dispatchEvent(new Event("visibilitychange"));
        vi.advanceTimersByTime(90_000);
        expect(refresh).not.toHaveBeenCalled();
    });
});

describe("the unread count in the tab title", () => {
    it("is put in front on every page", () => {
        mount(3);
        expect(document.title).toBe("(3) Orders · Saroh");
    });

    it("follows the count as it changes, and goes at zero", () => {
        mount(3);
        mount(4);
        expect(document.title).toBe("(4) Orders · Saroh");
        mount(0);
        expect(document.title).toBe("Orders · Saroh");
    });

    it("is absent for someone with no inbox", () => {
        mount(null);
        expect(document.title).toBe("Orders · Saroh");
    });

    it("is put back when a navigation writes a new title", async () => {
        vi.useRealTimers();
        mount(2);
        document.title = "Bookings · Saroh";
        // The head is watched; the observer runs after this task.
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(document.title).toBe("(2) Bookings · Saroh");
    });

    it("leaves the bare title behind when the shell goes", () => {
        mount(5);
        act(() => root.unmount());
        root = createRoot(host);
        expect(document.title).toBe("Orders · Saroh");
    });
});

describe("signed out", () => {
    it("the sentence gets its Sign in button, which opens accounts in a new tab", () => {
        const open = vi.spyOn(window, "open").mockReturnValue(null);
        mount();
        expect(setErrorAction).toHaveBeenCalledTimes(1);
        const [sentence, action] = setErrorAction.mock.calls[0] as unknown as [
            string,
            { label: string; onClick: () => void },
        ];
        expect(sentence).toBe(SIGNED_OUT);
        expect(action.label).toBe("Sign in");
        action.onClick();
        // A new tab: this page and what was typed on it stay.
        expect(open).toHaveBeenCalledWith(
            "https://accounts.test/login",
            "_blank",
            "noopener",
        );
        open.mockRestore();
    });
});
