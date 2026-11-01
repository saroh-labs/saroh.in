// @vitest-environment jsdom
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MobileSheet } from "./mobile-sheet";
import { FEATURE_ITEMS, SOLUTION_ITEMS } from "./nav-items";
import { SiteNav } from "./site-nav";

/**
 * The signed-in header (owner, 1 Nov): the page's HTML is the signed-out
 * nav; once the browser is idle it asks the API's get-session, and a
 * signed-in visitor gets their initial (name, email, Account, Sign out) and
 * "Open dashboard". Any failure is signed out.
 */
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/lib/browser/env", () => ({
    browserEnv: {
        SAROH_API_URL: "https://api.example.test",
        NEXT_PUBLIC_ACCOUNTS_URL: "https://accounts.example.test",
        NEXT_PUBLIC_LAUNCH_MODE: "open",
    },
}));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

const Nav = () => (
    <SiteNav features={FEATURE_ITEMS} solutions={SOLUTION_ITEMS} />
);
const SESSION = {
    session: { id: "s1" },
    user: { name: "Asha Rao", email: "asha@example.com" },
};

let idle: (() => void) | null = null;
const fetchMock = vi.fn();

beforeEach(() => {
    idle = null;
    window.sessionStorage.clear();
    window.requestIdleCallback = ((cb: () => void) => {
        idle = cb;
        return 1;
    }) as typeof window.requestIdleCallback;
    window.cancelIdleCallback = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const answer = (body: unknown, ok = true) =>
    Promise.resolve({ ok, json: () => Promise.resolve(body) });

async function goIdle() {
    await act(async () => {
        idle?.();
        await Promise.resolve();
    });
}

describe("the signed-in header", () => {
    it("asks nothing before the browser is idle, and draws the signed-out nav", () => {
        fetchMock.mockReturnValue(answer(SESSION));
        render(<Nav />);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(screen.getAllByRole("link", { name: "Sign in" }).length).toBe(1);
        expect(screen.getAllByRole("link", { name: "Start free" }).length).toBe(
            2,
        );
        expect(screen.queryByText("Open dashboard")).toBeNull();
    });

    it("keeps today's markup on the server, signed in or not", () => {
        const html = renderToString(<Nav />);
        expect(html).toContain("Sign in");
        expect(html).toContain("Start free");
        expect(html).not.toContain("Open dashboard");
    });

    it("signed in: the initial and Open dashboard, in place of Sign in and Start free", async () => {
        fetchMock.mockReturnValue(answer(SESSION));
        render(<Nav />);
        await goIdle();
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api.example.test/api/auth/get-session",
            { credentials: "include" },
        );
        expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
        expect(screen.queryByRole("link", { name: "Start free" })).toBeNull();
        const dashboards = screen.getAllByRole("link", {
            name: "Open dashboard",
        });
        expect(dashboards.length).toBe(2); // wide and phone
        expect(dashboards[0].getAttribute("href")).toBe(
            "https://accounts.example.test/",
        );
        const initial = screen.getByRole("button", { name: "Your account" });
        expect(initial.textContent).toBe("A");
        expect(initial.getAttribute("aria-haspopup")).toBe("true");
        expect(initial.getAttribute("aria-expanded")).toBe("false");
    });

    it("the initial's menu: name, email, Account, Sign out; Esc closes it", async () => {
        fetchMock.mockReturnValue(answer(SESSION));
        render(<Nav />);
        await goIdle();
        const initial = screen.getByRole("button", { name: "Your account" });
        fireEvent.click(initial);
        expect(initial.getAttribute("aria-expanded")).toBe("true");
        const menu = screen.getByRole("menu", { name: "Your account" });
        expect(within(menu).getByText("Asha Rao")).toBeTruthy();
        expect(within(menu).getByText("asha@example.com")).toBeTruthy();
        expect(
            within(menu)
                .getByRole("menuitem", { name: "Account" })
                .getAttribute("href"),
        ).toBe("https://accounts.example.test/account");
        const signOut = within(menu).getByRole("menuitem", {
            name: "Sign out",
        });
        expect(document.activeElement?.textContent).toBe("Account");
        fireEvent.keyDown(menu, { key: "ArrowDown" });
        expect(document.activeElement).toBe(signOut);
        // Masked in a session recording.
        expect(initial.closest("[data-ph-mask]")).not.toBeNull();

        fireEvent.keyDown(document, { key: "Escape" });
        expect(screen.queryByRole("menu")).toBeNull();
        expect(document.activeElement).toBe(initial);
    });

    it("Sign out posts to the API, forgets the kept answer and draws the signed-out nav", async () => {
        fetchMock.mockReturnValue(answer(SESSION));
        render(<Nav />);
        await goIdle();
        expect(window.sessionStorage.getItem("saroh:visitor")).toContain(
            "asha@example.com",
        );
        fetchMock.mockReturnValue(answer({ success: true }));
        fireEvent.click(screen.getByRole("button", { name: "Your account" }));
        await act(async () => {
            fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
            await Promise.resolve();
        });
        expect(fetchMock).toHaveBeenLastCalledWith(
            "https://api.example.test/api/auth/sign-out",
            expect.objectContaining({
                method: "POST",
                credentials: "include",
            }),
        );
        expect(window.sessionStorage.getItem("saroh:visitor")).not.toContain(
            "asha@example.com",
        );
        expect(screen.getAllByRole("link", { name: "Sign in" }).length).toBe(1);
        expect(screen.queryByText("Open dashboard")).toBeNull();
    });

    it("a failed check is signed out", async () => {
        fetchMock.mockReturnValue(Promise.reject(new Error("offline")));
        render(<Nav />);
        await goIdle();
        expect(screen.getAllByRole("link", { name: "Sign in" }).length).toBe(1);
        expect(screen.queryByText("Open dashboard")).toBeNull();
    });

    it("an answer kept in the tab is used without asking again", async () => {
        window.sessionStorage.setItem(
            "saroh:visitor",
            JSON.stringify({ at: Date.now(), visitor: SESSION.user }),
        );
        render(<Nav />);
        await goIdle();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(screen.getAllByText("Open dashboard").length).toBe(2);
    });
});

describe("the phone sheet, signed in", () => {
    it("shows who is signed in, Account and Sign out in place of Sign in", () => {
        const onSignOut = vi.fn();
        render(
            <MobileSheet
                section={null}
                pathname="/"
                resources={[]}
                tools={[]}
                featureItems={FEATURE_ITEMS}
                solutionItems={SOLUTION_ITEMS}
                visitor={SESSION.user}
                onSignOut={onSignOut}
                onClose={vi.fn()}
            />,
        );
        const sheet = screen.getByRole("dialog", { name: "Menu" });
        expect(
            within(sheet).queryByRole("link", { name: "Sign in" }),
        ).toBeNull();
        expect(
            within(sheet)
                .getByText("asha@example.com")
                .closest("[data-ph-mask]"),
        ).not.toBeNull();
        expect(within(sheet).getByText("Asha Rao")).toBeTruthy();
        expect(
            within(sheet)
                .getByRole("link", { name: "Account" })
                .getAttribute("href"),
        ).toBe("https://accounts.example.test/account");
        expect(
            within(sheet)
                .getByRole("link", { name: "Open dashboard" })
                .getAttribute("href"),
        ).toBe("https://accounts.example.test/");
        fireEvent.click(
            within(sheet).getByRole("button", { name: "Sign out" }),
        );
        expect(onSignOut).toHaveBeenCalled();
    });
});
