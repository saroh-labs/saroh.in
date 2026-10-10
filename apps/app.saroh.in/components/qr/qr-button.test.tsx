// @vitest-environment jsdom
/**
 * The QR button beside a link, and its panel (plan U7, DEC-118).
 *
 * A saved link finds the code its target already has, or offers "Make this
 * code" to someone who may: an explicit press, so merely opening the panel
 * never writes. A second open reuses the code. Someone who may only look
 * gets a QR of the public link and is told it isn't counted. An instant
 * link (a pay link) is drawn from the link itself: nothing is read and no
 * code is ever made. Everything is done in the panel; "More options" is
 * only the way to the rest.
 *
 * `react-dom/client` + `act`, as the other component tests do.
 */
import type { ReactElement, ReactNode } from "react";
import { act, cloneElement, createContext, useContext } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShareLinkButton } from "@/components/sites/share-link-button";
import { code } from "@/lib/qr/fixtures.test-data";
import type { QrLink, QrPanelRead } from "@/lib/qr/panel";
import { findPanelCode, NOT_COUNTED, panelCodeInput } from "@/lib/qr/panel";
import { shareLink } from "@/lib/sites/share-links";

import { QrButton } from "./qr-button";
import type { DownloadEnv } from "./qr-download";

const openQrPanel = vi.fn();
const makeQrPanelCode = vi.fn();
vi.mock("@/lib/qr/actions", () => ({
    openQrPanel: (...args: unknown[]) => openQrPanel(...args) as unknown,
    makeQrPanelCode: (...args: unknown[]) =>
        makeQrPanelCode(...args) as unknown,
}));
// The popover as its open state and its content in place: Radix's own
// positioning needs a real browser (as the other component tests do for
// a dialog or a sheet). What is pinned here is what the button and panel
// do, not the primitive.
const Open = createContext<{ open: boolean; set: (open: boolean) => void }>({
    open: false,
    set: () => undefined,
});
vi.mock("@saroh/ui/popover", () => ({
    Popover: ({
        open,
        onOpenChange,
        children,
    }: {
        open: boolean;
        onOpenChange: (open: boolean) => void;
        children?: ReactNode;
    }) => (
        <Open.Provider value={{ open, set: onOpenChange }}>
            {children}
        </Open.Provider>
    ),
    PopoverTrigger: ({
        children,
    }: {
        children: ReactElement<{ onClick?: () => void }>;
    }) => {
        const at = useContext(Open);
        return cloneElement(children, { onClick: () => at.set(!at.open) });
    },
    PopoverContent: ({
        children,
        role,
        "aria-label": label,
    }: {
        children?: ReactNode;
        role?: string;
        "aria-label"?: string;
    }) =>
        useContext(Open).open ? (
            <div role={role} aria-label={label}>
                {children}
            </div>
        ) : null,
}));
const showError = vi.fn();
const showSuccess = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
}));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...rest
    }: {
        href: string;
        children?: ReactNode;
    }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));

const SITE: QrLink = {
    mode: "saved",
    kind: "SITE",
    siteId: "site_1",
    url: "https://glow.saroh.app",
    what: "your website",
    from: "Website screen",
};
const PAY: QrLink = {
    mode: "instant",
    url: "https://glow.saroh.app/pay/abc123",
    what: "this invoice's pay link",
    opens: "pay",
    fileName: "pay-link-qr",
};
const BUSINESS = { name: "Glow Studio", initials: "GS", logo: null };
const ready = (
    over: Partial<Extract<QrPanelRead, { state: "ready" }>> = {},
): QrPanelRead => ({
    state: "ready",
    siteId: "site_1",
    live: true,
    canChange: true,
    code: null,
    business: BUSINESS,
    ...over,
});
const siteCode = (over: Parameters<typeof code>[0] = {}) =>
    code({
        code: "w3b",
        target: {
            kind: "SITE",
            ref: null,
            name: "Website",
            path: "/",
            missing: false,
        },
        place: "OTHER",
        placeNote: "Website screen",
        label: "Scan to visit",
        ...over,
    });

const saved: string[] = [];
const env: DownloadEnv = {
    rasterise: () => Promise.resolve(new Blob(["png"], { type: "image/png" })),
    save: (_blob, filename) => {
        saved.push(filename);
    },
};

let host: HTMLDivElement;
let root: Root;

async function draw(node: ReactNode) {
    await act(async () => {
        root.render(node);
        await Promise.resolve();
    });
}
const settle = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};
const q = <T extends Element = HTMLElement>(sel: string) =>
    document.body.querySelector<T>(sel);
const trigger = () => q<HTMLButtonElement>("[data-qr-button]");
const panelButton = (name: string) =>
    Array.from(
        document.body.querySelectorAll<HTMLButtonElement>(
            '[role="dialog"] button',
        ),
    ).find((b) => b.textContent.trim() === name);
const panel = () => q('[role="dialog"]');
async function click(el: Element | null | undefined) {
    expect(el, "the control is on screen").toBeTruthy();
    await act(async () => {
        el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await settle();
    });
}
const close = () => click(trigger());

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    openQrPanel.mockReset();
    makeQrPanelCode.mockReset();
    showError.mockReset();
    saved.length = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("QrButton — the button", () => {
    it("names the thing it is for, and is closed until pressed", async () => {
        await draw(<QrButton link={SITE} env={env} />);
        expect(trigger()?.getAttribute("aria-label")).toBe(
            "QR code for your website",
        );
        expect(trigger()?.textContent).toBe("QR code");
        expect(panel()).toBeNull();
        // Drawing the button reads nothing.
        expect(openQrPanel).not.toHaveBeenCalled();
    });

    it("keeps its name when it is the icon alone", async () => {
        await draw(<QrButton link={SITE} compact="always" env={env} />);
        expect(trigger()?.textContent).toBe("");
        expect(trigger()?.getAttribute("aria-label")).toBe(
            "QR code for your website",
        );
    });
});

describe("QrPanel — a saved link", () => {
    it("shows the code the target already has, drawn from its short link", async () => {
        openQrPanel.mockResolvedValue(ready({ code: siteCode() }));
        await draw(<QrButton link={SITE} env={env} />);
        await click(trigger());

        expect(openQrPanel).toHaveBeenCalledWith({
            kind: "SITE",
            ref: undefined,
            siteId: "site_1",
            from: "Website screen",
        });
        expect(panel()?.getAttribute("aria-label")).toBe(
            "QR code for your website",
        );
        expect(q("[data-qr-panel]")?.getAttribute("data-qr-panel")).toBe(
            "code",
        );
        expect(q("[data-qr-link]")?.textContent).toBe("glow.saroh.app/q/w3b");
        expect(
            q('[role="dialog"] [data-qr-art]')?.getAttribute("aria-label"),
        ).toBe("QR code that opens Website");
        expect(q("[data-qr-not-counted]")).toBeNull();
        expect(makeQrPanelCode).not.toHaveBeenCalled();

        // Its files, here: the same names Settings › Share gives.
        await click(panelButton("Download SVG"));
        await click(panelButton("Download PNG"));
        expect(saved).toEqual([
            "glow-studio-qr-w3b.svg",
            "glow-studio-qr-w3b.png",
        ]);
        // The rest is optional, and one link away.
        const more = Array.from(
            document.body.querySelectorAll('[role="dialog"] a'),
        ).find((a) => a.textContent === "More options");
        expect(more?.getAttribute("href")).toBe("/settings/share");
    });

    it("never writes on open: making the code is its own press", async () => {
        openQrPanel.mockResolvedValue(ready());
        makeQrPanelCode.mockResolvedValue({ ok: true, data: siteCode() });
        await draw(<QrButton link={SITE} env={env} />);
        await click(trigger());

        expect(q("[data-qr-panel]")?.getAttribute("data-qr-panel")).toBe(
            "make",
        );
        expect(panel()?.textContent).toContain(
            "No QR code for your website yet.",
        );
        expect(q('[role="dialog"] [data-qr-art]')).toBeNull();
        expect(makeQrPanelCode).not.toHaveBeenCalled();

        await click(panelButton("Make this code"));
        expect(makeQrPanelCode).toHaveBeenCalledTimes(1);
        expect(makeQrPanelCode).toHaveBeenCalledWith("site_1", {
            kind: "SITE",
            ref: undefined,
            from: "Website screen",
        });
        // Made, and usable at once, without leaving the panel.
        expect(q("[data-qr-link]")?.textContent).toBe("glow.saroh.app/q/w3b");
        expect(panelButton("Download PNG")).toBeTruthy();
        expect(panelButton("Copy link")).toBeTruthy();
    });

    it("reuses the code on a second open", async () => {
        openQrPanel.mockResolvedValue(ready());
        makeQrPanelCode.mockResolvedValue({ ok: true, data: siteCode() });
        await draw(<QrButton link={SITE} env={env} />);
        await click(trigger());
        await click(panelButton("Make this code"));
        await close();
        expect(panel()).toBeNull();

        await click(trigger());
        expect(q("[data-qr-link]")?.textContent).toBe("glow.saroh.app/q/w3b");
        expect(makeQrPanelCode).toHaveBeenCalledTimes(1);
        // Known already: not even asked for again.
        expect(openQrPanel).toHaveBeenCalledTimes(1);
    });

    it("says the API's refusal in the panel and keeps the button to try again", async () => {
        openQrPanel.mockResolvedValue(ready());
        makeQrPanelCode.mockResolvedValue({
            ok: false,
            error: "Your online shop isn't open on this site, so a code can't open it yet.",
            reason: "shop-closed",
        });
        await draw(<QrButton link={SITE} env={env} />);
        await click(trigger());
        await click(panelButton("Make this code"));
        expect(q('[role="dialog"] [role="alert"]')?.textContent).toBe(
            "Your online shop isn't open on this site, so a code can't open it yet.",
        );
        expect(panelButton("Make this code")?.disabled).toBe(false);
    });

    it("gives someone who may only look a QR of the public link, not counted", async () => {
        openQrPanel.mockResolvedValue(ready({ canChange: false }));
        await draw(<QrButton link={SITE} env={env} />);
        await click(trigger());

        expect(q("[data-qr-panel]")?.getAttribute("data-qr-panel")).toBe(
            "instant",
        );
        expect(q("[data-qr-link]")?.textContent).toBe("glow.saroh.app");
        expect(q("[data-qr-not-counted]")?.textContent).toBe(
            "Not counted. This is a QR of the link itself; an owner or admin can make a saved code that counts its scans.",
        );
        expect(panelButton("Make this code")).toBeUndefined();
        expect(makeQrPanelCode).not.toHaveBeenCalled();
        await click(panelButton("Download SVG"));
        expect(saved).toEqual(["your-website-qr.svg"]);
    });

    it("shows an existing code to someone who may only look", async () => {
        openQrPanel.mockResolvedValue(
            ready({ canChange: false, code: siteCode() }),
        );
        await draw(<QrButton link={SITE} env={env} />);
        await click(trigger());
        expect(q("[data-qr-link]")?.textContent).toBe("glow.saroh.app/q/w3b");
    });

    it("says the link works once the site is published", async () => {
        openQrPanel.mockResolvedValue(ready({ live: false, code: siteCode() }));
        await draw(<QrButton link={SITE} env={env} />);
        await click(trigger());
        expect(q("[data-qr-not-live]")?.textContent).toBe(
            "Your site isn't published yet. This link works once it is.",
        );
    });

    it("draws the link itself where codes can't be had (Website off, no site)", async () => {
        openQrPanel.mockResolvedValue({ state: "unavailable" });
        await draw(<QrButton link={SITE} env={env} />);
        await click(trigger());
        expect(q("[data-qr-link]")?.textContent).toBe("glow.saroh.app");
        expect(q("[data-qr-not-counted]")?.textContent).toBe(NOT_COUNTED);
        expect(panelButton("Make this code")).toBeUndefined();
    });

    it("says a failed read as a failure, and asks again on Try again", async () => {
        openQrPanel
            .mockResolvedValueOnce({ state: "failed" })
            .mockResolvedValueOnce(ready({ code: siteCode() }));
        await draw(<QrButton link={SITE} env={env} />);
        await click(trigger());
        expect(q('[role="dialog"] [role="alert"]')?.textContent).toBe(
            "We couldn't load this QR code. Nothing was changed.",
        );
        // Never "no code yet", and nothing to make from a failure.
        expect(panelButton("Make this code")).toBeUndefined();
        await click(panelButton("Try again"));
        expect(openQrPanel).toHaveBeenCalledTimes(2);
        expect(q("[data-qr-link]")?.textContent).toBe("glow.saroh.app/q/w3b");
    });
});

describe("QrPanel — an instant link", () => {
    it("draws a pay link without reading or making a code", async () => {
        await draw(<QrButton link={PAY} compact="always" env={env} />);
        expect(trigger()?.getAttribute("aria-label")).toBe(
            "QR code for this invoice's pay link",
        );
        await click(trigger());

        expect(q("[data-qr-panel]")?.getAttribute("data-qr-panel")).toBe(
            "instant",
        );
        expect(q("[data-qr-link]")?.textContent).toBe(
            "glow.saroh.app/pay/abc123",
        );
        expect(panel()?.textContent).toContain(
            "Opens the pay page for this link. It isn't the UPI QR on the invoice.",
        );
        expect(q("[data-qr-not-counted]")?.textContent).toBe(NOT_COUNTED);
        await click(panelButton("Download PNG"));
        expect(saved).toEqual(["pay-link-qr.png"]);

        expect(openQrPanel).not.toHaveBeenCalled();
        expect(makeQrPanelCode).not.toHaveBeenCalled();
        // Settings › Share holds no pay codes, so it isn't offered.
        expect(document.body.querySelector('[role="dialog"] a')).toBeNull();
    });
});

describe("the share buttons", () => {
    const read = (links: { shop: string | null; site: string | null }) => ({
        links: { ...links, book: null },
    });

    it("has no QR button while the shop is off and there is no site", async () => {
        const offer = shareLink(read({ shop: null, site: null }), [
            "shop",
            "site",
        ]);
        expect(offer).toBeNull();
        // The caller draws nothing without a link: absent, not broken.
        await draw(offer ? <ShareLinkButton link={offer} /> : null);
        expect(trigger()).toBeNull();
    });

    it("offers the shop's saved code beside its share button while it is live", async () => {
        const offer = shareLink(
            read({ shop: "https://glow.saroh.app/shop", site: null }),
            ["shop", "site"],
        );
        await draw(offer ? <ShareLinkButton link={offer} /> : null);
        expect(trigger()?.getAttribute("aria-label")).toBe(
            "QR code for your online shop",
        );
        expect(trigger()?.getAttribute("data-qr-button")).toBe("saved");
        openQrPanel.mockResolvedValue(ready());
        await click(trigger());
        expect(openQrPanel).toHaveBeenCalledWith({
            kind: "SHOP",
            ref: undefined,
            siteId: undefined,
            from: "Orders",
        });
    });
});

describe("the panel's rules", () => {
    const product = (over: Parameters<typeof code>[0]) =>
        code({
            target: {
                kind: "PRODUCT",
                ref: "p1",
                name: "Argan shampoo",
                path: "/shop/argan-shampoo",
                missing: false,
            },
            ...over,
        });
    const want = { kind: "PRODUCT" as const, ref: "p1", from: "Product page" };

    it("prefers the code made from the same place, else the newest for the target", () => {
        const counter = product({ code: "aaa", place: "COUNTER" });
        const here = product({
            code: "bbb",
            place: "OTHER",
            placeNote: "product page",
        });
        expect(findPanelCode([counter, here], want)?.code).toBe("bbb");
        expect(findPanelCode([counter], want)?.code).toBe("aaa");
    });

    it("never hands out a retired code, or another target's", () => {
        expect(
            findPanelCode([product({ retired: true }), siteCode()], want),
        ).toBeNull();
    });

    it("makes a plain code, placed where the button was pressed", () => {
        expect(panelCodeInput(want)).toEqual({
            targetKind: "PRODUCT",
            targetRef: "p1",
            place: "OTHER",
            placeNote: "Product page",
            label: "Scan to order",
            style: "PLAIN",
        });
    });
});
