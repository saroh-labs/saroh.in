// @vitest-environment jsdom
/**
 * A bare domain in "Your own domain" (DEC-140): typing one adds its `www`
 * and the dialog says so and shows the forwarding step. Any other subdomain
 * keeps its one CNAME and no forwarding step. A `www` domain's row says
 * where its bare domain stands, and a bare domain that already points at
 * Saroh is added from that row, in place. Made-up domains only.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BareDomainRead, SiteDomain } from "@/lib/domains/service";

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
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showInfo: vi.fn(),
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
    showWarning: vi.fn(),
}));

const BARE = "yourshop.co.in";
const WWW = `www.${BARE}`;

function wwwDomain(
    bare: Partial<BareDomainRead> = {},
    over: Partial<SiteDomain> = {},
): SiteDomain {
    return {
        id: "dom_www",
        hostname: WWW,
        status: "VERIFIED",
        siteId: "site_rye",
        verifiedAt: "2026-10-10T09:00:00Z",
        lastCheckedAt: null,
        lastCheckResult: null,
        createdAt: "2026-10-10T08:00:00Z",
        dnsRecord: {
            type: "TXT",
            name: `_saroh-verification.${WWW}`,
            value: "saroh-verify=abc123",
        },
        hosting: {
            state: "LIVE",
            problem: null,
            checkedAt: "2026-10-12T04:30:00Z",
            dnsRecord: { type: "CNAME", name: WWW, value: "sites.example" },
        },
        hostnameKind: "www",
        bare: {
            hostname: BARE,
            forwardTo: `https://${WWW}`,
            state: null,
            checkedAt: "2026-10-12T04:30:00Z",
            added: false,
            ...bare,
        },
        ...over,
    };
}

const waitingWww = wwwDomain(
    { checkedAt: null },
    { status: "PENDING", verifiedAt: null, hosting: undefined },
);

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const mock of [list, claim, verify, showSuccess, showError]) {
        mock.mockReset();
    }
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
const card = (hostname: string) =>
    host.querySelector<HTMLElement>(`[data-domain="${hostname}"]`);
/** Every value the block offers to copy, in order. */
const copied = (within: ParentNode | null | undefined) =>
    Array.from(within?.querySelectorAll("code") ?? []).map(
        (c) => c.textContent,
    );

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

describe("adding a bare domain", () => {
    it("says the site will live at www, then the CNAME for www and the forwarding step", async () => {
        claim.mockResolvedValue({ ok: true, data: waitingWww });
        await draw();
        await press(item("Add domain", host));
        type(field(), `https://${BARE}/`);
        await press(item("Add domain", dialog() ?? document));

        // What was typed is what is sent: the api decides it becomes www.
        expect(claim).toHaveBeenCalledWith("site_rye", BARE);
        expect(dialogName()).toBe(`${WWW} added`);
        const step = dialog()?.querySelector("[data-added-domain]");
        expect(step?.querySelector('[data-notice="info"]')?.textContent).toBe(
            `Your site will live at ${WWW}. ${BARE} will forward to it, which is the last step below.`,
        );
        const text = step?.textContent ?? "";
        expect(text).toContain("1. Proves you own the domain");
        expect(text).toContain(
            "2. Sends visitors to your site once it's verified",
        );
        expect(text).toContain(`3. Forward ${BARE} to ${WWW}`);
        expect(text).toContain("Forwarding, Redirect or URL redirect");
        expect(text).toContain("ALIAS, ANAME or flattened CNAME");
        // The CNAME is for www, and the forwarding's two ends can be copied.
        expect(copied(step)).toEqual([
            "TXT",
            `_saroh-verification.${WWW}`,
            "saroh-verify=abc123",
            "CNAME",
            WWW,
            "saroh.app",
            BARE,
            `https://${WWW}`,
        ]);
        // Nobody left the dialog, and the card is on the page behind it.
        expect(card(WWW)).not.toBeNull();
        expect(item("Check now", dialog() ?? document)).toBeDefined();
    });

    it("doesn't say it again when www was typed, but still shows the forwarding step", async () => {
        claim.mockResolvedValue({ ok: true, data: waitingWww });
        await draw();
        await press(item("Add domain", host));
        type(field(), WWW);
        await press(item("Add domain", dialog() ?? document));

        const step = dialog()?.querySelector("[data-added-domain]");
        expect(step?.querySelector('[data-notice="info"]')).toBeNull();
        expect(step?.textContent).toContain(`3. Forward ${BARE} to ${WWW}`);
    });

    it("keeps one CNAME and no forwarding step for any other subdomain", async () => {
        const shop: SiteDomain = {
            ...waitingWww,
            id: "dom_shop",
            hostname: "shop.yourshop.co.in",
            hostnameKind: "subdomain",
            bare: null,
        };
        claim.mockResolvedValue({ ok: true, data: shop });
        await draw();
        await press(item("Add domain", host));
        type(field(), "shop.yourshop.co.in");
        await press(item("Add domain", dialog() ?? document));

        const step = dialog()?.querySelector("[data-added-domain]");
        expect(step?.querySelector("[data-bare-domain]")).toBeNull();
        expect(step?.textContent).not.toContain("Forward");
        expect(copied(step)).toHaveLength(6);
    });
});

describe("a www domain's row", () => {
    it("says its bare domain forwards, with no step and no check", async () => {
        list.mockResolvedValue([wwwDomain({ state: "FORWARDS" })]);
        await draw();
        const row = card(WWW);
        expect(row?.textContent).toContain("Live");
        expect(row?.textContent).toContain(
            `Checked 12 Oct: ${BARE} forwards to ${WWW}.`,
        );
        expect(row?.querySelector("[data-notice]")).toBeNull();
        expect(row?.textContent).not.toContain("Forwarding, Redirect");
        expect(item("Check again", row ?? host)).toBeUndefined();
    });

    it("warns about https when it forwards over http only, and stays Live", async () => {
        list.mockResolvedValue([wwwDomain({ state: "FORWARDS_HTTP_ONLY" })]);
        await draw();
        const row = card(WWW);
        expect(row?.querySelector('[data-notice="warning"]')?.textContent).toBe(
            `Checked 12 Oct: ${BARE} forwards to ${WWW}, but not over https. Someone who types https://${BARE} will see a browser warning. Turn on HTTPS or SSL for forwarding at your provider if it offers it. ${WWW} is not affected.`,
        );
        expect(row?.textContent).toContain(`Live at ${WWW}`);
        expect(row?.textContent).not.toContain("Needs attention");
    });

    it("says when it doesn't forward, shows the step, and can be checked again", async () => {
        list.mockResolvedValue([wwwDomain({ state: "NOT_FORWARDING" })]);
        // The check's answer carries the domain without its TXT record.
        const { dnsRecord: _txt, ...checked } = wwwDomain({
            state: "FORWARDS",
        });
        verify.mockResolvedValue({
            ok: true,
            data: { domain: checked, verified: true },
        });
        await draw();
        const row = card(WWW);
        // A notice beside a domain that is still live, never its state.
        expect(row?.textContent).toContain(`Live at ${WWW}`);
        expect(row?.querySelector('[data-notice="warning"]')?.textContent).toBe(
            `Checked 12 Oct: ${BARE} doesn't forward to ${WWW} yet. Someone who types ${BARE} won't reach your site. ${WWW} is not affected.`,
        );
        expect(row?.querySelector('[role="alert"]')).toBeNull();
        expect(row?.textContent).toContain(`Forward ${BARE} to ${WWW}`);
        expect(copied(row?.querySelector("[data-bare-domain]"))).toEqual([
            BARE,
            `https://${WWW}`,
        ]);

        await press(item("Check again", row ?? host));
        expect(verify).toHaveBeenCalledWith("dom_www");
        expect(card(WWW)?.querySelector("[data-notice]")).toBeNull();
        expect(card(WWW)?.textContent).toContain(`${BARE} forwards to ${WWW}.`);
    });

    it("adds a bare domain that points straight at Saroh, in place", async () => {
        list.mockResolvedValue([wwwDomain({ state: "POINTS_HERE" })]);
        const bareRow: SiteDomain = {
            ...waitingWww,
            id: "dom_bare",
            hostname: BARE,
            hostnameKind: "bare",
            bare: null,
            dnsRecord: {
                type: "TXT",
                name: `_saroh-verification.${BARE}`,
                value: "saroh-verify=def456",
            },
        };
        claim.mockResolvedValue({ ok: true, data: bareRow });
        await draw();
        const row = card(WWW);
        expect(
            row?.querySelector('[data-notice="info"]')?.textContent,
        ).toContain(
            `${BARE} points straight at Saroh, so it needs no forwarding. It won't open your site until you add it as a domain too.`,
        );

        await press(item(`Add ${BARE}`, row ?? host));

        expect(claim).toHaveBeenCalledWith("site_rye", BARE);
        // No dialog and no other page: its card is here, with its record.
        expect(dialog()).toBeNull();
        expect(card(BARE)?.textContent).toContain("saroh-verify=def456");
        expect(card(BARE)?.textContent).toContain(
            `${BARE} has no www in front`,
        );
        expect(card(WWW)?.textContent).toContain(
            "is added as a domain of its own",
        );
        expect(item(`Add ${BARE}`, host)).toBeUndefined();
        expect(showSuccess).toHaveBeenCalledWith(
            `${BARE} added. Now add its record at your registrar.`,
        );
    });

    it("says why when the bare domain couldn't be added, and keeps the offer", async () => {
        list.mockResolvedValue([wwwDomain({ state: "POINTS_HERE" })]);
        claim.mockResolvedValue({
            ok: false,
            error: `Hostname "${BARE}" is already claimed`,
        });
        await draw();
        await press(item(`Add ${BARE}`, host));
        expect(showError).toHaveBeenCalledWith(
            `Hostname "${BARE}" is already claimed`,
        );
        expect(item(`Add ${BARE}`, host)).toBeDefined();
        expect(card(BARE)).toBeNull();
    });
});
