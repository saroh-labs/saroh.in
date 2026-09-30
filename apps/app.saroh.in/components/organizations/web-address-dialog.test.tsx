// @vitest-environment jsdom
/**
 * Settings › Business › Web address (DEC-069, L4): the owner sees Change
 * and anyone else the read-only note; the dialog checks the new address as
 * it is typed, offers the API's suggestion for a taken one, says the
 * `--` rule in the API's words, and names the day an old address is
 * released in the business's time zone.
 *
 * `react-dom/client` + `act` directly, as the other component tests do. The
 * dialog's parts are drawn in place: a portal is not what is tested here.
 */
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    WebAddressAvailability,
    WebAddressView,
} from "@/lib/organizations/web-address";
import {
    consequences,
    holdDate,
    previousLine,
} from "@/lib/organizations/web-address";

import { WebAddressSection } from "./web-address-section";

const checkWebAddress = vi.fn();
const saveWebAddress = vi.fn();
vi.mock("@/lib/organizations/web-address-actions", () => ({
    checkWebAddress: (...args: unknown[]) =>
        checkWebAddress(...args) as unknown,
    saveWebAddress: (...args: unknown[]) => saveWebAddress(...args) as unknown,
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh }),
}));
const showSuccess = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
    showError: vi.fn(),
}));
vi.mock("@saroh/ui/dialog", () => {
    const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
    return {
        Dialog: ({
            open,
            children,
        }: {
            open: boolean;
            children?: ReactNode;
        }) => (open ? <div role="dialog">{children}</div> : null),
        DialogContent: Pass,
        DialogHeader: Pass,
        DialogTitle: Pass,
        DialogDescription: Pass,
        DialogFooter: Pass,
    };
});

const ZONE = "Asia/Kolkata";

function viewOf(over: Partial<WebAddressView> = {}): WebAddressView {
    return {
        address: "rye",
        origin: "https://rye.saroh.app",
        platformOrigin: "https://rye.saroh.app",
        customDomain: null,
        links: { site: "https://rye.saroh.app", shop: null, book: null },
        previous: [],
        changeAvailable: true,
        canChange: true,
        ...over,
    };
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    checkWebAddress.mockReset();
    saveWebAddress.mockReset();
    showSuccess.mockReset();
    refresh.mockReset();
    checkWebAddress.mockImplementation(
        (address: string): Promise<WebAddressAvailability> =>
            Promise.resolve({
                address,
                ok: true,
                reason: null,
                suggestion: null,
            }),
    );
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

function render(view: WebAddressView) {
    act(() =>
        root.render(
            <WebAddressSection read={{ ok: true, data: view }} zone={ZONE} />,
        ),
    );
}

/** Long enough for the 350ms debounce and the answer to land. */
async function settle(ms = 400) {
    await act(async () => {
        await new Promise((r) => setTimeout(r, ms));
    });
}

function button(name: string): HTMLButtonElement | undefined {
    return Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
}

function field(): HTMLInputElement {
    const el = host.querySelector<HTMLInputElement>('[role="dialog"] input');
    if (!el) throw new Error("No address field");
    return el;
}

function typeInto(el: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

function openDialog() {
    act(() => button("Change")?.click());
}

const text = () => host.textContent;

describe("the web address row", () => {
    it("shows the address and Open, and Change for the owner", () => {
        render(viewOf());
        expect(text()).toContain("rye.saroh.app");
        expect(host.querySelector('a[href="https://rye.saroh.app"]')).not.toBe(
            null,
        );
        expect(button("Change")).toBeDefined();
        expect(text()).not.toContain("Only the owner can change this.");
    });

    it("is read-only for an admin, with the note", () => {
        render(viewOf({ canChange: false }));
        expect(button("Change")).toBeUndefined();
        expect(text()).toContain("Only the owner can change this.");
    });

    it("draws no Change and no note while changing isn't rolled out", () => {
        render(viewOf({ canChange: false, changeAvailable: false }));
        expect(button("Change")).toBeUndefined();
        expect(text()).not.toContain("Only the owner");
    });

    it("offers no Open while nothing is live", () => {
        render(viewOf({ links: { site: null, shop: null, book: null } }));
        expect(host.querySelector("a")).toBe(null);
    });

    it("says where customers go with a verified custom domain", () => {
        render(
            viewOf({
                origin: "https://shop.rye.in",
                customDomain: "shop.rye.in",
            }),
        );
        expect(text()).toContain(
            "Customers see shop.rye.in; rye.saroh.app still works",
        );
    });

    it("lists an old address with the day it stops forwarding", () => {
        render(
            viewOf({
                previous: [
                    {
                        address: "rye-old",
                        redirectUntil: "2026-12-27T20:00:00.000Z",
                        reservedUntil: "2026-12-27T20:00:00.000Z",
                    },
                ],
            }),
        );
        // 01:30 on the 28th in Kolkata.
        expect(text()).toMatch(
            /rye-old\.saroh\.app forwards here until 28 Dec/,
        );
    });
});

describe("the Change dialog", () => {
    it("states what changing does before the button", () => {
        render(viewOf());
        openDialog();
        const said = text();
        expect(said).toMatch(
            /rye\.saroh\.app forwards here until \d{1,2} \w{3}( \d{4})?, then it's released/,
        );
        expect(said).toContain("Links you've shared keep working until then");
        expect(said).toContain(
            "Customers signed in on your site will need to sign in again",
        );
        expect(said.indexOf("sign in again")).toBeLessThan(
            said.indexOf("Change web address"),
        );
    });

    it("shows the suggestion for a taken address, and Use fills it", async () => {
        checkWebAddress.mockImplementation((address: string) =>
            Promise.resolve(
                address === "pulse"
                    ? {
                          address,
                          ok: false,
                          reason: "pulse.saroh.app is taken",
                          suggestion: "pulse-2",
                      }
                    : { address, ok: true, reason: null, suggestion: null },
            ),
        );
        render(viewOf());
        openDialog();
        typeInto(field(), "pulse");
        await settle();
        expect(text()).toContain("pulse.saroh.app is taken");
        expect(button("Change web address")?.disabled).toBe(true);

        act(() => button("Use pulse-2.saroh.app")?.click());
        expect(field().value).toBe("pulse-2");
        await settle();
        expect(text()).toContain("Free");
        expect(button("Change web address")?.disabled).toBe(false);
    });

    it("says the two-hyphen rule in the API's words", async () => {
        checkWebAddress.mockImplementation((address: string) =>
            Promise.resolve({
                address,
                ok: false,
                reason: "An address can't have two hyphens in a row",
                suggestion: null,
            }),
        );
        render(viewOf());
        openDialog();
        typeInto(field(), "a--b");
        // Kept as typed, so the API can say why.
        expect(field().value).toBe("a--b");
        await settle();
        expect(checkWebAddress).toHaveBeenLastCalledWith("a--b");
        expect(text()).toContain("An address can't have two hyphens in a row");
        expect(button("Change web address")?.disabled).toBe(true);
    });

    it("puts a refusal on the field, and on save says the new address", async () => {
        saveWebAddress.mockResolvedValueOnce({
            ok: false,
            error: "rye-bakery.saroh.app is taken",
            field: "address",
            suggestion: "rye-bakery-2",
        });
        render(viewOf());
        openDialog();
        typeInto(field(), "rye-bakery");
        await settle();
        await act(async () => {
            host.querySelector<HTMLFormElement>(
                '[role="dialog"] form',
            )?.requestSubmit();
            await Promise.resolve();
        });
        await settle(10);
        expect(text()).toContain("rye-bakery.saroh.app is taken");
        expect(button("Use rye-bakery-2.saroh.app")).toBeDefined();

        saveWebAddress.mockResolvedValueOnce({
            ok: true,
            data: viewOf({
                address: "rye-bakery-2",
                platformOrigin: "https://rye-bakery-2.saroh.app",
            }),
        });
        act(() => button("Use rye-bakery-2.saroh.app")?.click());
        await settle();
        await act(async () => {
            host.querySelector<HTMLFormElement>(
                '[role="dialog"] form',
            )?.requestSubmit();
            await Promise.resolve();
        });
        await settle(10);
        expect(saveWebAddress).toHaveBeenLastCalledWith("rye-bakery-2");
        expect(showSuccess).toHaveBeenCalledWith(
            "Your web address is now rye-bakery-2.saroh.app",
        );
        expect(refresh).toHaveBeenCalled();
        expect(host.querySelector('[role="dialog"]')).toBe(null);
    });
});

describe("dates are days in the business's time zone", () => {
    const at = "2026-12-27T20:00:00.000Z";
    const now = new Date("2026-09-30T06:00:00.000Z");

    it("is the 28th in Kolkata and the 27th in London", () => {
        expect(holdDate(at, "Asia/Kolkata", now)).toBe("28 Dec");
        expect(holdDate(at, "Europe/London", now)).toBe("27 Dec");
    });

    it("names the year when it isn't this one there", () => {
        expect(holdDate("2027-01-05T10:00:00.000Z", ZONE, now)).toBe(
            "5 Jan 2027",
        );
    });

    it("words an old address that only stays held", () => {
        expect(
            previousLine(
                { address: "rye", redirectUntil: null, reservedUntil: at },
                ".saroh.app",
                ZONE,
                now,
            ),
        ).toBe("rye.saroh.app is kept for you until 28 Dec");
    });

    it("says 90 days on, and only what is true with no live site", () => {
        const lines = consequences(
            {
                address: "rye",
                platformOrigin: "https://rye.saroh.app",
                links: { site: null, shop: null, book: null },
            },
            ZONE,
            now,
        );
        // 30 Sep + 90 days = 29 Dec.
        expect(lines).toEqual([
            "rye.saroh.app stays yours until 29 Dec, then it's released",
        ]);
    });
});
