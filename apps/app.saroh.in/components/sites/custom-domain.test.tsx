// @vitest-environment jsdom
/**
 * "Your own domain" on Website › Settings, read first (owner, 10 Oct): the
 * domains are cards, and one "Add domain" button opens the dialog that
 * takes the hostname and then shows its records. No field sits open on the
 * page, and nobody leaves the dialog to finish. Made-up domains only.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SiteDomain } from "@/lib/domains/service";

import { CustomDomain } from "./custom-domain";

const list = vi.fn();
const claim = vi.fn();
const verify = vi.fn();
vi.mock("@/lib/domains/actions", () => ({
    listSiteDomains: (...args: unknown[]) => list(...args) as unknown,
    claimDomain: (...args: unknown[]) => claim(...args) as unknown,
    verifyDomain: (...args: unknown[]) => verify(...args) as unknown,
    removeDomain: vi.fn(),
}));
vi.mock("@/env", () => ({ env: {} }));
vi.mock("@/components/shared/business-zone", () => ({
    useBusinessZone: () => "Asia/Kolkata",
}));
const showSuccess = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showInfo: vi.fn(),
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
    showWarning: vi.fn(),
}));

const waiting: SiteDomain = {
    id: "dom_1",
    hostname: "shop.example.com",
    status: "PENDING",
    siteId: "site_rye",
    verifiedAt: null,
    lastCheckedAt: null,
    lastCheckResult: null,
    createdAt: "2026-10-10T09:00:00Z",
    dnsRecord: {
        type: "TXT",
        name: "_saroh.shop.example.com",
        value: "saroh-verify=abc123",
    },
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
    list.mockReset();
    claim.mockReset();
    verify.mockReset();
    showSuccess.mockReset();
    list.mockResolvedValue([]);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

async function settle() {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });
}

async function draw() {
    act(() => root.render(<CustomDomain siteId="site_rye" />));
    await settle();
}

const item = (name: string, within: ParentNode = document) =>
    Array.from(within.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.textContent === name,
    );
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const dialogName = () => {
    const id = dialog()?.getAttribute("aria-labelledby");
    return id ? document.getElementById(id)?.textContent : undefined;
};
const field = () =>
    document.querySelector<HTMLInputElement>("#add-domain-field");

async function press(button: HTMLElement | null | undefined) {
    if (!button) throw new Error("Nothing to press");
    await act(async () => {
        button.click();
        await Promise.resolve();
    });
    await settle();
}

function type(el: HTMLInputElement | null, value: string) {
    if (!el) throw new Error("Nothing to type in");
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

describe("Add domain", () => {
    it("is one button, with no field on the page until it is pressed", async () => {
        await draw();
        expect(host.textContent).toContain("No domain of your own yet.");
        expect(host.querySelector("input, form")).toBeNull();
        expect(dialog()).toBeNull();
        await press(item("Add domain", host));
        expect(dialogName()).toBe("Add a domain");
        expect(field()?.labels?.[0]?.textContent).toBe("Domain to add");
        expect(dialog()?.textContent).toContain(
            "A domain you already own, like www.yourshop.in.",
        );
    });

    it("a refusal stays open with what was typed, in the API's words", async () => {
        claim.mockResolvedValue({
            ok: false,
            error: "Your own domain isn't in your plan.",
        });
        await draw();
        await press(item("Add domain", host));
        type(field(), "https://Shop.Example.com/");
        await press(item("Add domain", dialog() ?? document));
        // A pasted address is taken down to its domain before it is sent.
        expect(claim).toHaveBeenCalledWith("site_rye", "shop.example.com");
        expect(dialogName()).toBe("Add a domain");
        expect(field()?.value).toBe("https://Shop.Example.com/");
        expect(dialog()?.querySelector('[role="alert"]')?.textContent).toBe(
            "Your own domain isn't in your plan.",
        );
        expect(host.querySelector("[data-domain]")).toBeNull();
    });

    it("an empty field is said in place and not sent", async () => {
        await draw();
        await press(item("Add domain", host));
        await press(item("Add domain", dialog() ?? document));
        expect(claim).not.toHaveBeenCalled();
        expect(dialog()?.querySelector('[role="alert"]')?.textContent).toBe(
            "Enter the domain to add.",
        );
    });

    it("once added, shows the records and the check inside the dialog, and the card under it", async () => {
        claim.mockResolvedValue({ ok: true, data: waiting });
        verify.mockResolvedValue({
            ok: true,
            data: {
                domain: {
                    lastCheckedAt: "2026-10-10T09:05:00Z",
                    lastCheckResult: "NO_RECORD",
                },
            },
        });
        await draw();
        await press(item("Add domain", host));
        type(field(), "shop.example.com");
        await press(item("Add domain", dialog() ?? document));

        expect(dialogName()).toBe("shop.example.com added");
        const step = dialog()?.querySelector("[data-added-domain]");
        expect(step?.textContent).toContain("Waiting for DNS");
        expect(step?.textContent).toContain(
            "Add these two records at your registrar. Copy each part exactly.",
        );
        expect(step?.textContent).toContain("saroh-verify=abc123");
        // The same domain is a card on the page, behind the dialog.
        expect(
            host.querySelector('[data-domain="shop.example.com"]'),
        ).not.toBeNull();

        await press(item("Check now", dialog() ?? document));
        expect(verify).toHaveBeenCalledWith("dom_1");
        expect(dialogName()).toBe("shop.example.com added");

        await press(item("Done"));
        expect(dialog()).toBeNull();
        expect(document.activeElement).toBe(item("Add domain", host));
        // The next opening starts empty, on the first step.
        await press(item("Add domain", host));
        expect(dialogName()).toBe("Add a domain");
        expect(field()?.value).toBe("");
        expect(dialog()?.textContent).toContain(
            "Add another domain for this site.",
        );
    });

    it("Cancel adds nothing", async () => {
        await draw();
        await press(item("Add domain", host));
        type(field(), "shop.example.com");
        await press(item("Cancel"));
        expect(claim).not.toHaveBeenCalled();
        expect(dialog()).toBeNull();
        expect(host.querySelector("[data-domain]")).toBeNull();
    });
});
