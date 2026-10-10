// @vitest-environment jsdom
/**
 * "Your QR codes" and the screen around it (plan U5): the list says where
 * each code is placed, what it opens and its counts; a gone page says so;
 * retired codes sit apart with no controls; the counts are the plan's; and
 * someone who may only look gets the list and a code to view, no controls.
 */
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { code } from "@/lib/qr/fixtures.test-data";
import type { QrScreen } from "@/lib/qr/screen";
import { buildQrTargets } from "@/lib/qr/targets";
import type { QrCodeView } from "@/lib/qr/types";
import { MADE_NOTE, TARGET_GONE } from "@/lib/qr/words";

import { QrCodesList } from "./qr-codes-list";
import { mergeCodes, QrShare } from "./qr-share";

const retireQrCode = vi.fn();
vi.mock("@/lib/qr/actions", () => ({
    createQrCode: vi.fn(),
    updateQrCode: vi.fn(),
    retireQrCode: (...args: unknown[]) => retireQrCode(...args) as unknown,
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh }),
}));
const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
    showError: (...args: unknown[]) => showError(...args) as unknown,
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
// Drawn in place: a portal is not what is tested here.
vi.mock("@/components/shared/confirm-dialog", () => ({
    ConfirmDialog: ({
        open,
        title,
        description,
        confirmLabel,
        onConfirm,
    }: {
        open: boolean;
        title: string;
        description: string;
        confirmLabel: string;
        onConfirm: () => void;
    }) =>
        open ? (
            <div role="alertdialog">
                <h2>{title}</h2>
                <p>{description}</p>
                <button type="button" onClick={onConfirm}>
                    {confirmLabel}
                </button>
            </div>
        ) : null,
}));

const counter = code({
    code: "aaa",
    scans: { total: 64, last7Days: 12 },
    bookings: 11,
});
const mirror = code({
    code: "bbb",
    place: "MIRROR",
    target: {
        kind: "SITE",
        ref: null,
        name: "Website",
        path: "/",
        missing: false,
    },
    scans: { total: 31, last7Days: 0 },
});
const gone = code({
    code: "ccc",
    place: "FLYER",
    target: {
        kind: "PRODUCT",
        ref: "old",
        name: "A product no longer in your shop",
        path: null,
        missing: true,
    },
});
const retired = code({
    code: "ddd",
    place: "CARD",
    retired: true,
    scans: { total: 1, last7Days: 0 },
});
const ALL = [counter, mirror, gone, retired];

const list = (
    over: Partial<Parameters<typeof QrCodesList>[0]> = {},
): HTMLElement => {
    const el = document.createElement("div");
    el.innerHTML = renderToStaticMarkup(
        <QrCodesList
            codes={ALL}
            included
            canChange
            activeId={null}
            onChange={vi.fn()}
            onView={vi.fn()}
            onRetire={vi.fn()}
            {...over}
        />,
    );
    return el;
};
const row = (el: HTMLElement, short: string) =>
    el.querySelector<HTMLElement>(`[data-qr-row="${short}"]`);

describe("QrCodesList", () => {
    it("lists placed at, opens, scans and bookings, with Change and Retire", () => {
        const el = list();
        const first = row(el, "aaa");
        expect(first?.textContent).toContain("Counter");
        expect(first?.textContent).toContain("glow.saroh.app/q/aaa");
        expect(first?.textContent).toContain("Booking page");
        expect(first?.querySelector("[data-qr-scans]")?.textContent).toBe("64");
        expect(first?.textContent).toContain("12 this week");
        expect(first?.querySelector("[data-qr-bookings]")?.textContent).toBe(
            "11",
        );
        expect(
            Array.from(first?.querySelectorAll("button") ?? []).map((b) =>
                b.getAttribute("aria-label"),
            ),
        ).toEqual(["Change the Counter code", "Retire the Counter code"]);
        // What the Bookings column counts is said, never left to a tooltip.
        expect(el.textContent).toContain(MADE_NOTE);
    });

    it("shows a dash, not a zero, where no booking has been counted", () => {
        expect(
            row(list(), "bbb")?.querySelector("[data-qr-bookings]")
                ?.textContent,
        ).toBe("–");
    });

    it("says a gone page is gone, and still offers Change", () => {
        const flyer = row(list(), "ccc");
        expect(flyer?.querySelector("[data-qr-opens]")?.textContent).toBe(
            TARGET_GONE,
        );
        expect(
            flyer?.querySelector('[aria-label="Change the Flyer code"]'),
        ).toBeTruthy();
    });

    it("keeps retired codes apart, with no controls", () => {
        const el = list();
        expect(row(el, "ddd")).toBeNull();
        const group = el.querySelector('[aria-label="Retired codes"]');
        expect(group?.textContent).toContain("Retired");
        expect(group?.textContent).toContain("Visiting card");
        expect(group?.textContent).toContain("1 scan");
        expect(group?.textContent).toContain("opens your home page");
        expect(group?.querySelector("button")).toBeNull();
    });

    it("leaves the counts out when the plan doesn't include them", () => {
        const el = list({ included: false });
        expect(el.querySelector("[data-qr-scans]")).toBeNull();
        expect(el.querySelector("[data-qr-bookings]")).toBeNull();
        expect(el.textContent).not.toContain("Scans");
        expect(el.textContent).not.toContain(MADE_NOTE);
        expect(el.textContent).not.toContain("1 scan");
        // Still the codes, and still theirs to change.
        expect(row(el, "aaa")?.textContent).toContain("Counter");
    });

    it("offers only View to someone who may not change", () => {
        const el = list({ canChange: false });
        expect(
            Array.from(row(el, "aaa")?.querySelectorAll("button") ?? []).map(
                (b) => b.getAttribute("aria-label"),
            ),
        ).toEqual(["View the Counter code"]);
        expect(el.textContent).not.toContain("Retire the");
    });

    it("says there are none yet, and who makes them", () => {
        expect(list({ codes: [] }).textContent).toContain("No QR codes yet");
        expect(list({ codes: [], canChange: false }).textContent).toContain(
            "An owner or admin makes them.",
        );
    });
});

describe("mergeCodes", () => {
    it("lays a newer local copy over the read, and adds what is new", () => {
        const changed = {
            ...counter,
            label: "New",
            updatedAt: "2026-10-10T10:00:00.000Z",
        };
        const made = code({ code: "new" });
        const merged = mergeCodes([counter, mirror], [changed, made]);
        expect(merged.map((c) => c.code)).toEqual(["new", "aaa", "bbb"]);
        expect(merged[1]?.label).toBe("New");
        // Once the read has caught up, the server's copy wins.
        const caught = { ...changed, scans: { total: 65, last7Days: 13 } };
        expect(mergeCodes([caught], [changed])[0]?.scans.total).toBe(65);
    });
});

describe("QrShare", () => {
    let host: HTMLDivElement;
    let root: Root;

    const screen = (
        over: Partial<Extract<QrScreen, { state: "ready" }>> = {},
        codes: QrCodeView[] = ALL,
    ): Extract<QrScreen, { state: "ready" }> => ({
        state: "ready",
        site: { id: "site_1", name: "Glow Studio" },
        view: {
            origin: "https://glow.saroh.app",
            live: true,
            included: true,
            codes,
        },
        canChange: true,
        targets: buildQrTargets({
            origin: "https://glow.saroh.app",
            links: { shop: null, book: "https://glow.saroh.app/book" },
            products: null,
            pages: [],
        }),
        displayOrigin: "https://glow.saroh.app",
        swatches: ["#1c1c1a", "#5c2a48"],
        lock: null,
        business: {
            name: "Glow Studio",
            initials: "GS",
            logo: null,
            hasLogo: false,
        },
        ...over,
    });

    async function draw(s: Extract<QrScreen, { state: "ready" }>) {
        await act(async () => {
            root.render(<QrShare screen={s} />);
            await Promise.resolve();
        });
    }
    const button = (name: string) =>
        Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
            (b) =>
                (b.getAttribute("aria-label") ?? b.textContent).trim() === name,
        );
    async function click(el: Element | null | undefined) {
        expect(el, "the control is on screen").toBeTruthy();
        await act(async () => {
            el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            for (let i = 0; i < 6; i++) await Promise.resolve();
        });
    }

    beforeEach(() => {
        (
            globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
        ).IS_REACT_ACT_ENVIRONMENT = true;
        Element.prototype.scrollIntoView = vi.fn();
        host = document.createElement("div");
        document.body.appendChild(host);
        root = createRoot(host);
        vi.clearAllMocks();
    });
    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    it("gives someone who may only look the list and a code to view", async () => {
        await draw(screen({ canChange: false }));
        expect(host.querySelector("[data-qr-maker]")).toBeNull();
        expect(host.querySelector('[role="radiogroup"]')).toBeNull();
        expect(button("Make this code")).toBeUndefined();
        // The first code, as it prints, with its files.
        expect(
            host
                .querySelector("[data-qr-viewer]")
                ?.getAttribute("data-qr-viewer"),
        ).toBe("aaa");
        expect(button("Download PNG")).toBeTruthy();
        expect(button("Retire the Counter code")).toBeUndefined();
        expect(button("Change the Counter code")).toBeUndefined();

        await click(button("View the Mirror code"));
        expect(
            host
                .querySelector("[data-qr-viewer]")
                ?.getAttribute("data-qr-viewer"),
        ).toBe("bbb");
        expect(host.querySelector("[data-qr-link]")?.textContent).toBe(
            "glow.saroh.app/q/bbb",
        );
    });

    it("says codes open once the site is published, with the way there", async () => {
        const s = screen();
        await draw({ ...s, view: { ...s.view, live: false } });
        const note = host.querySelector("[data-qr-not-live]");
        expect(note?.textContent).toContain(
            "You can make codes now; they open once it is.",
        );
        expect(note?.querySelector("a")?.getAttribute("href")).toBe(
            "/sites/site_1",
        );
        // And they can still be made.
        expect(button("Make another") ?? button("Make this code")).toBeTruthy();
    });

    it("opens a code in the maker on Change", async () => {
        await draw(screen());
        await click(button("Change the Mirror code"));
        expect(
            host
                .querySelector("[data-qr-maker]")
                ?.getAttribute("data-qr-maker"),
        ).toBe("change");
        expect(host.querySelector("[data-qr-link]")?.textContent).toBe(
            "glow.saroh.app/q/bbb",
        );
        expect(
            host
                .querySelector('[data-qr-row="bbb"]')
                ?.getAttribute("aria-current"),
        ).toBe("true");
    });

    it("asks before retiring, saying where the printed code will go", async () => {
        retireQrCode.mockResolvedValue({
            ok: true,
            data: {
                ...counter,
                retired: true,
                updatedAt: "2026-10-10T11:00:00.000Z",
            },
        });
        await draw(screen());
        await click(button("Retire the Counter code"));
        const dialog = host.querySelector('[role="alertdialog"]');
        expect(dialog?.textContent).toContain("Retire the Counter code?");
        expect(dialog?.textContent).toContain(
            "will land on your home page, not Booking page",
        );
        expect(dialog?.textContent).toContain("This cannot be undone.");
        expect(retireQrCode).not.toHaveBeenCalled();

        await click(button("Retire code"));
        expect(retireQrCode).toHaveBeenCalledWith("site_1", "qr_aaa");
        expect(host.querySelector('[data-qr-row="aaa"]')).toBeNull();
        expect(host.querySelector('[data-qr-retired="aaa"]')).toBeTruthy();
        expect(refresh).toHaveBeenCalled();
        expect(showSuccess).toHaveBeenCalledWith(
            "Code retired",
            "A printed copy now opens your home page.",
        );
    });

    it("says so when a code couldn't be retired, and leaves it listed", async () => {
        retireQrCode.mockResolvedValue({
            ok: false,
            error: "We couldn't retire that code. Try again.",
        });
        await draw(screen());
        await click(button("Retire the Counter code"));
        await click(button("Retire code"));
        expect(showError).toHaveBeenCalledWith(
            "We couldn't retire that code. Try again.",
        );
        expect(host.querySelector('[data-qr-row="aaa"]')).toBeTruthy();
    });
});
