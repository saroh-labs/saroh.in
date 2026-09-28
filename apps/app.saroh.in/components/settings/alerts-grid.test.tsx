// @vitest-environment jsdom
/**
 * "What you hear about" (F14): a switch saves at once with Undo (F12), a
 * channel that can't deliver can't be switched on, and a refused save goes
 * back and says so.
 *
 * `react-dom/client` + `act` directly, as the section-field tests do.
 */
import type { AnchorHTMLAttributes } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AlertPreferences } from "@/lib/notifications/preferences";

import { AlertsGrid } from "./alerts-grid";

const saveAlert = vi.fn();
const undoAlert = vi.fn();
vi.mock("@/lib/notifications/actions", () => ({
    saveAlert: (...args: unknown[]) => saveAlert(...args) as unknown,
    undoAlert: (...args: unknown[]) => undoAlert(...args) as unknown,
}));

const offer = vi.fn();
vi.mock("@/components/organizations/use-settings-undo", () => ({
    useSettingsUndo: () => ({ offer, settle: vi.fn() }),
}));

const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
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

let root: Root;
let host: HTMLDivElement;

function prefs(over: Partial<AlertPreferences> = {}): AlertPreferences {
    return {
        alerts: [
            {
                key: "order",
                channels: { bell: true, email: false, whatsapp: false },
            },
            {
                key: "failed",
                channels: { bell: true, email: true, whatsapp: false },
            },
        ],
        channels: {
            bell: { available: true },
            email: { available: true },
            whatsapp: { available: false, reason: "NO_PROVIDER" },
        },
        canConnect: true,
        ...over,
    };
}

function render(p: AlertPreferences) {
    act(() => {
        root.render(<AlertsGrid read={{ status: "ok", prefs: p }} />);
    });
}

function switchFor(label: string): HTMLButtonElement {
    const found = Array.from(
        host.querySelectorAll<HTMLButtonElement>('[role="switch"]'),
    ).find((el) => el.getAttribute("aria-label")?.startsWith(label));
    if (!found) throw new Error(`No switch "${label}"`);
    return found;
}

beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    vi.clearAllMocks();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("AlertsGrid", () => {
    it("draws the design's heading and the channels that can deliver", () => {
        render(prefs());
        expect(host.textContent).toContain("What you hear about");
        expect(host.textContent).toContain(
            "Only for you — your team picks their own.",
        );
        const headers = Array.from(
            host.querySelectorAll('[role="columnheader"]'),
        ).map((h) => h.textContent);
        expect(headers).toEqual(["Alert", "Bell", "Email"]);
    });

    it("a switch saves at once, and offers Undo that puts it back", async () => {
        saveAlert.mockResolvedValue({ ok: true, data: prefs() });
        undoAlert.mockResolvedValue({ ok: true, data: prefs() });
        render(prefs());

        const email = switchFor("New order by Email");
        expect(email.getAttribute("aria-checked")).toBe("false");
        await act(async () => {
            email.click();
            await Promise.resolve();
        });

        expect(saveAlert).toHaveBeenCalledWith({
            alert: "order",
            channel: "email",
            on: true,
        });
        expect(offer).toHaveBeenCalledTimes(1);
        const [message, undo] = offer.mock.calls[0] as [
            string,
            () => Promise<unknown>,
        ];
        expect(message).toBe("Email on for New order");
        await expect(undo()).resolves.toEqual({ ok: true });
        expect(undoAlert).toHaveBeenCalledWith({
            back: { alert: "order", channel: "email", on: false },
            expect: true,
        });
    });

    it("an Undo refused says why", async () => {
        saveAlert.mockResolvedValue({ ok: true, data: prefs() });
        undoAlert.mockResolvedValue({
            ok: false,
            error: "Changed since — reload",
        });
        render(prefs());
        await act(async () => {
            switchFor("Payment failed by Email").click();
            await Promise.resolve();
        });
        const undo = offer.mock.calls[0]?.[1] as () => Promise<unknown>;
        await expect(undo()).resolves.toEqual({
            ok: false,
            error: "Changed since — reload",
        });
    });

    it("a refused save says so, and offers no Undo", async () => {
        saveAlert.mockResolvedValue({
            ok: false,
            error: "Connect email in Providers to get alerts by email.",
        });
        render(prefs());
        await act(async () => {
            switchFor("New order by Bell").click();
            await Promise.resolve();
        });
        expect(showError).toHaveBeenCalledWith(
            "Connect email in Providers to get alerts by email.",
            "Your alerts are as they were.",
        );
        expect(offer).not.toHaveBeenCalled();
        // The switch is back as the server has it.
        expect(
            switchFor("New order by Bell").getAttribute("aria-checked"),
        ).toBe("true");
    });

    it("with no email provider, email can't be switched on, and the way to connect one is offered", () => {
        render(
            prefs({
                alerts: [
                    {
                        key: "order",
                        channels: { bell: true, email: false, whatsapp: false },
                    },
                ],
                channels: {
                    bell: { available: true },
                    email: { available: false, reason: "NO_PROVIDER" },
                    whatsapp: { available: false, reason: "NO_PROVIDER" },
                },
            }),
        );
        const email = switchFor("New order by Email");
        expect(email.disabled).toBe(true);
        act(() => email.click());
        expect(saveAlert).not.toHaveBeenCalled();
        const link = host.querySelector<HTMLAnchorElement>(
            'a[href="/settings/providers"]',
        );
        expect(link?.textContent).toBe("Connect email in Providers");
    });

    it("a connected WhatsApp shows, fixed off, and never saves", () => {
        render(
            prefs({
                channels: {
                    bell: { available: true },
                    email: { available: true },
                    whatsapp: { available: false, reason: "NO_NUMBER" },
                },
            }),
        );
        const whatsapp = switchFor("New order by WhatsApp");
        expect(whatsapp.disabled).toBe(true);
        expect(whatsapp.getAttribute("aria-label")).toBe(
            "New order by WhatsApp, off — no WhatsApp number for you",
        );
        expect(host.textContent).toContain(
            "Saroh doesn't keep a WhatsApp number for you",
        );
    });

    it("every switch that can be pressed shows the pointer, a hover and a focus ring", () => {
        render(prefs());
        const bell = switchFor("New order by Bell");
        expect(bell.className).toContain("cursor-pointer");
        expect(bell.className).toContain("hover:bg-muted");
        expect(bell.className).toContain("active:bg-border");
        expect(bell.className).toContain("focus-visible:ring-2");
    });
});
