// @vitest-environment jsdom
/**
 * Signing out drops this tab's React Query cache and tells the other tabs
 * before leaving (DEC-259); a sign-out the API refused drops nothing.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SwitchAccountButton } from "@/components/organizations/team/switch-account-button";
import { SignOutButton } from "@/components/sign-out-button";

const signOut = vi.hoisted(() => vi.fn());
const afterSignOut = vi.hoisted(() => vi.fn());
vi.mock("@saroh/auth/client", () => ({ authClient: { signOut } }));
vi.mock("@/lib/query/invalidate", () => ({ afterSignOut }));
vi.mock("@saroh/ui/toast", () => ({ showError: vi.fn() }));

let root: Root;
let host: HTMLDivElement;
let href: string;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    signOut.mockReset();
    afterSignOut.mockReset();
    href = "";
    // Where it goes next, without jsdom navigating.
    vi.stubGlobal("location", {
        get href() {
            return href || "https://app.saroh.localhost/";
        },
        set href(next: string) {
            expect(afterSignOut).toHaveBeenCalled();
            href = next;
        },
    });
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
});

async function press(node: React.ReactNode) {
    act(() => root.render(node));
    const el = host.querySelector<HTMLElement>("button, a, [role=button]");
    if (!el) throw new Error("nothing to press");
    await act(async () => {
        el.click();
        await new Promise((r) => setTimeout(r, 0));
    });
}

describe("sign-out paths", () => {
    it("Sign out clears and tells the other tabs, then leaves", async () => {
        signOut.mockResolvedValue({});
        await press(<SignOutButton />);
        expect(afterSignOut).toHaveBeenCalledTimes(1);
        expect(href).not.toBe("");
    });

    it("Sign out and use another account: the same, then on to `next`", async () => {
        signOut.mockResolvedValue({ error: null });
        await press(
            <SwitchAccountButton
                label="Use another"
                next="/x"
                signInUrl="/in"
            />,
        );
        expect(afterSignOut).toHaveBeenCalledTimes(1);
        expect(href).toBe("/x");
    });

    it("a refused sign-out drops nothing", async () => {
        signOut.mockResolvedValue({ error: { message: "no" } });
        await press(
            <SwitchAccountButton
                label="Use another"
                next="/x"
                signInUrl="/in"
            />,
        );
        expect(afterSignOut).not.toHaveBeenCalled();
        expect(href).toBe("");
    });
});
