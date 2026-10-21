// @vitest-environment jsdom
/**
 * "Your booking page" on Bookings › Services (DEC-175, #1158): read first,
 * one row, finished in place.
 *
 * - Live: the address, Copy link and the QR code.
 * - Not live yet: it says customers can't open it, and offers neither the
 *   link nor the QR code; Publish booking page opens a sheet that
 *   publishes it and ends on the link to copy, with Done.
 * - A refusal stays in the sheet, in the API's words.
 * - Someone who may not publish is told who can; a website already
 *   published goes to Website; no website yet offers Make my booking page.
 */
import type { AnchorHTMLAttributes } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BookingLinkView } from "@/lib/services/booking-link";

import { BookingLinkRow } from "./booking-link-row";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    unstable_rethrow: () => undefined,
}));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...rest
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));
// The QR button has tests of its own; here only whether it is offered.
vi.mock("@/components/qr/qr-button", () => ({
    QrButton: ({ link }: { link: { url: string; kind?: string } }) => (
        <button type="button" data-qr={link.kind} data-url={link.url}>
            QR code
        </button>
    ),
}));
const api = { publish: vi.fn(), make: vi.fn() };
vi.mock("@/lib/services/booking-link-actions", () => ({
    publishBookingPage: () => api.publish() as unknown,
    makeBookingPage: () => api.make() as unknown,
}));
const toast = { showSuccess: vi.fn(), showError: vi.fn() };
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...a: unknown[]) => toast.showSuccess(...a) as unknown,
    showError: (...a: unknown[]) => toast.showError(...a) as unknown,
    dismissToast: vi.fn(),
}));

const URL = "https://bend-physio.saroh.app/book";
const view = (over: Partial<BookingLinkView> = {}): BookingLinkView => ({
    state: "draft",
    site: { id: "site_1", name: "Bend Physio", address: "bend-physio" },
    host: "bend-physio.saroh.app",
    url: URL,
    published: false,
    mayPublish: true,
    make: null,
    ...over,
});
const LIVE = view({ state: "live", published: true });

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    api.publish.mockReset();
    api.make.mockReset();
    router.refresh.mockReset();
    toast.showSuccess.mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

function draw(v: BookingLinkView) {
    act(() => root.render(<BookingLinkRow view={v} />));
}
const dialog = () => document.body.querySelector<HTMLElement>("[role=dialog]");
function buttons(within: ParentNode | null = host) {
    return Array.from(within?.querySelectorAll("button") ?? []).map((b) =>
        b.textContent.trim(),
    );
}
function button(name: string, within: ParentNode | null = host) {
    const hit = Array.from(within?.querySelectorAll("button") ?? []).find(
        (b) => b.textContent.trim() === name,
    );
    if (!hit) {
        throw new Error(
            `No "${name}" button in: ${buttons(within).join(", ")}`,
        );
    }
    return hit;
}
async function press(el: HTMLElement) {
    await act(async () => {
        el.click();
        await new Promise((r) => setTimeout(r, 20));
    });
}

describe("Your booking page", () => {
    it("live: the address, Copy link and its QR code", () => {
        draw(LIVE);
        expect(host.textContent).toContain("Your booking page");
        const link = host.querySelector<HTMLAnchorElement>(`a[href="${URL}"]`);
        expect(link?.textContent).toContain("bend-physio.saroh.app/book");
        expect(buttons()).toEqual(
            expect.arrayContaining(["Copy link", "QR code"]),
        );
        expect(host.querySelector("[data-qr]")?.getAttribute("data-qr")).toBe(
            "BOOK",
        );
        expect(host.textContent).not.toContain("Not live");
    });

    it("not live yet: says so, and holds back the link and the QR code", () => {
        draw(view());
        expect(host.textContent).toContain(
            "Not live yet: customers can't open it",
        );
        expect(host.querySelector("a[href]")).toBeNull();
        expect(buttons()).toEqual(["Publish booking page"]);
    });

    it("Publish booking page publishes in a sheet and ends on the link", async () => {
        api.publish.mockResolvedValue({ ok: true, data: LIVE });
        draw(view());
        await press(button("Publish booking page"));
        expect(dialog()?.textContent).toContain("Publish your booking page");
        expect(dialog()?.textContent).toContain(
            "Your website goes live with it",
        );
        await press(button("Publish booking page", dialog()));
        expect(api.publish).toHaveBeenCalledTimes(1);
        // Finished in place: the link to share, in the same sheet.
        expect(dialog()?.textContent).toContain("Your booking page is live");
        expect(buttons(dialog())).toEqual(
            expect.arrayContaining(["Copy link", "QR code", "Done"]),
        );
        expect(router.refresh).toHaveBeenCalled();
        // And the row behind it is live.
        expect(host.querySelector(`a[href="${URL}"]`)).not.toBeNull();
    });

    it("a refusal stays in the sheet, in the API's words", async () => {
        api.publish.mockResolvedValue({
            ok: false,
            error: "This site needs approval before it goes live.",
        });
        draw(view());
        await press(button("Publish booking page"));
        await press(button("Publish booking page", dialog()));
        expect(dialog()?.querySelector("[role=alert]")?.textContent).toContain(
            "This site needs approval before it goes live.",
        );
        expect(host.querySelector("a[href]")).toBeNull();
    });

    it("someone who may not publish is told who can, with nothing to press", () => {
        draw(view({ mayPublish: false }));
        expect(host.textContent).toContain("An owner or admin can publish it.");
        expect(buttons()).toEqual([]);
    });

    it("a website already published is put live from Website", () => {
        draw(view({ published: true }));
        const open = host.querySelector<HTMLAnchorElement>('a[href="/sites"]');
        expect(open?.textContent).toBe("Open Website");
        expect(buttons()).toEqual([]);
    });

    it("no website yet: Make my booking page, and the row then waits to publish", async () => {
        api.make.mockResolvedValue({ ok: true, data: view() });
        draw(
            view({
                state: "none",
                site: null,
                host: null,
                url: null,
                make: "ready",
            }),
        );
        expect(host.textContent).toContain("No booking page yet");
        await press(button("Make my booking page"));
        expect(api.make).toHaveBeenCalledTimes(1);
        expect(toast.showSuccess).toHaveBeenCalled();
        expect(buttons()).toEqual(["Publish booking page"]);
    });

    it("no website and no service to book: what to add, nothing to press", () => {
        draw(
            view({
                state: "none",
                site: null,
                host: null,
                url: null,
                make: "no-service",
            }),
        );
        expect(host.textContent).toContain(
            "Add a service customers can book online",
        );
        expect(buttons()).toEqual([]);
    });
});
