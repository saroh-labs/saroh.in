// @vitest-environment jsdom
/**
 * Share this page (plan 2026-11-18-001 U12, WXSShare): the page link, the
 * messages written from the page's own words, no email row until the
 * newsletter ships, and one QR per page made on the first Download QR.
 */
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { code } from "@/lib/qr/fixtures.test-data";
import type { QrPanelRead } from "@/lib/qr/panel";

import type { DownloadEnv } from "@/components/qr/link-qr/qr-download";
import { SharePageSheet } from "./share-page-sheet";

const openQrPanel = vi.fn();
const makeQrPanelCode = vi.fn();
vi.mock("@/lib/qr/actions", () => ({
    openQrPanel: (...args: unknown[]) => openQrPanel(...args) as unknown,
    makeQrPanelCode: (...args: unknown[]) =>
        makeQrPanelCode(...args) as unknown,
}));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
}));
// The sheet primitive needs a real browser; what is pinned is the content.
vi.mock("@saroh/ui/form-sheet", () => ({
    FormSheet: ({
        open,
        title,
        description,
        children,
    }: {
        open: boolean;
        title: string;
        description: ReactNode;
        children: ReactNode;
    }) =>
        open ? (
            <div role="dialog" aria-label={title}>
                <p>{description}</p>
                {children}
            </div>
        ) : null,
}));

const PAGE = {
    id: "page_bridal",
    title: "Bridal makeup packages",
    path: "/bridal",
    seoDescription: "HD and airbrush looks with a trial session",
};
const ready = (over: Partial<Extract<QrPanelRead, { state: "ready" }>> = {}) =>
    ({
        state: "ready",
        siteId: "site_1",
        live: true,
        canChange: true,
        code: null,
        business: { name: "Gulmohar", initials: "G", logo: null },
        ...over,
    }) satisfies QrPanelRead;

let host: HTMLDivElement;
let root: Root;
const env: DownloadEnv = {
    rasterise: vi.fn(() => Promise.resolve(new Blob(["png"]))),
    save: vi.fn(),
};

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    vi.clearAllMocks();
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

async function draw(justPublished = false) {
    await act(async () => {
        await Promise.resolve();
        root.render(
            <SharePageSheet
                open
                onClose={() => undefined}
                siteId="site_1"
                page={PAGE}
                business="Gulmohar"
                host="gulmohar.saroh.app"
                justPublished={justPublished}
                env={env}
            />,
        );
    });
}

describe("Share this page", () => {
    it("shows the link and messages from the page's own words, and no email row", async () => {
        openQrPanel.mockResolvedValue(ready());
        await draw(true);
        expect(host.textContent).toContain(
            "Bridal makeup packages is live. Share it where your customers are.",
        );
        expect(host.querySelector("[data-share-link]")?.textContent).toBe(
            "gulmohar.saroh.app/bridal",
        );
        const wa = host.querySelector<HTMLTextAreaElement>(
            "[data-share-whatsapp]",
        );
        expect(wa?.value).toBe(
            "Bridal makeup packages at Gulmohar. HD and airbrush looks with a trial session. See it here: gulmohar.saroh.app/bridal",
        );
        const open = host.querySelector<HTMLAnchorElement>(
            'a[href^="https://wa.me/"]',
        );
        expect(decodeURIComponent(open?.href ?? "")).toContain("See it here");
        expect(host.textContent).not.toMatch(/subscriber|email/i);
    });

    it("makes the page's QR on the first download, then reuses it", async () => {
        openQrPanel.mockResolvedValue(ready());
        makeQrPanelCode.mockResolvedValue({
            ok: true,
            data: code({
                code: "b1d",
                target: {
                    kind: "PAGE",
                    ref: PAGE.id,
                    name: PAGE.title,
                    path: "/bridal",
                    missing: false,
                },
            }),
        });
        await draw();
        const button = host.querySelector<HTMLButtonElement>("[data-share-qr]");
        await act(async () => {
            button?.click();
            await Promise.resolve();
        });
        expect(makeQrPanelCode).toHaveBeenCalledWith("site_1", {
            kind: "PAGE",
            ref: PAGE.id,
            siteId: "site_1",
            from: "Share this page",
        });
        expect(env.save).toHaveBeenCalledTimes(1);
        await act(async () => {
            button?.click();
            await Promise.resolve();
        });
        expect(makeQrPanelCode).toHaveBeenCalledTimes(1);
        expect(env.save).toHaveBeenCalledTimes(2);
    });

    it("downloads a QR of the page link for someone who may not make codes", async () => {
        openQrPanel.mockResolvedValue(ready({ canChange: false }));
        await draw();
        await act(async () => {
            host.querySelector<HTMLButtonElement>("[data-share-qr]")?.click();
            await Promise.resolve();
        });
        expect(makeQrPanelCode).not.toHaveBeenCalled();
        expect(env.save).toHaveBeenCalledTimes(1);
    });
});
