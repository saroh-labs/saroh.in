// @vitest-environment jsdom
/**
 * The receipt on WhatsApp (DEC-173, owner 20 Oct): with no email provider
 * it is offered once Undo has passed, and Undo takes the offer back. The
 * tab opens on the press and is pointed at `wa.me` once the share is
 * logged, or closed when it is refused. Saroh sends nothing itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { shareInvoice, toast } = vi.hoisted(() => ({
    shareInvoice: vi.fn(),
    toast: { showError: vi.fn(), showSuccess: vi.fn() },
}));
vi.mock("@/lib/invoices/actions", () => ({ shareInvoice }));
vi.mock("@saroh/ui/toast", () => toast);

import { offerWhatsAppReceipt, openWhatsAppShare } from "./whatsapp-share";

beforeEach(() => {
    shareInvoice.mockReset();
    toast.showError.mockReset();
    toast.showSuccess.mockReset();
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("WhatsApp receipt", () => {
    it("is offered after the Undo window, and not once taken back", () => {
        vi.useFakeTimers();
        const takeBack = offerWhatsAppReceipt("inv_1", "Vivek Nair", 10_000);
        vi.advanceTimersByTime(9_999);
        expect(toast.showSuccess).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Receipt ready for Vivek Nair.",
            undefined,
            expect.objectContaining({ label: "Share receipt on WhatsApp" }),
        );
        toast.showSuccess.mockReset();
        const again = offerWhatsAppReceipt("inv_1", "Vivek Nair", 10_000);
        again();
        vi.advanceTimersByTime(10_000);
        expect(toast.showSuccess).not.toHaveBeenCalled();
        takeBack();
    });

    it("opens WhatsApp itself when the screen that offered it has gone (review #14)", () => {
        vi.useFakeTimers();
        shareInvoice.mockReturnValue(new Promise(() => undefined));
        vi.spyOn(window, "open").mockReturnValue(null);
        const share = vi.fn(() => false);
        offerWhatsAppReceipt("inv_1", "Vivek Nair", 10_000, share);
        vi.advanceTimersByTime(10_000);
        const offer = toast.showSuccess.mock.calls.at(-1)?.[2] as {
            onClick: () => void;
        };
        offer.onClick();
        expect(share).toHaveBeenCalled();
        expect(shareInvoice).toHaveBeenCalledWith("inv_1", {
            channel: "WHATSAPP",
            kind: "RECEIPT",
        });
    });

    it("opens the share sheet on the receipt when one is given (U11)", () => {
        vi.useFakeTimers();
        const share = vi.fn(() => true);
        offerWhatsAppReceipt("inv_1", "Vivek Nair", 10_000, share);
        vi.advanceTimersByTime(10_000);
        const offer = toast.showSuccess.mock.calls.at(-1)?.[2] as {
            onClick: () => void;
        };
        offer.onClick();
        expect(share).toHaveBeenCalled();
        expect(shareInvoice).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it("opens the tab on the press and points it at wa.me", async () => {
        const tab = { close: vi.fn(), location: { href: "" }, opener: {} };
        vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
        shareInvoice.mockResolvedValue({
            ok: true,
            data: {
                whatsappUrl: "https://wa.me/919845012345?text=Thanks",
                text: "Thanks",
            },
        });
        expect(await openWhatsAppShare("inv_1", "RECEIPT")).toBe(true);
        expect(shareInvoice).toHaveBeenCalledWith("inv_1", {
            channel: "WHATSAPP",
            kind: "RECEIPT",
        });
        expect(tab.location.href).toBe(
            "https://wa.me/919845012345?text=Thanks",
        );
        expect(tab.opener).toBeNull();
    });

    it("with no phone, WhatsApp's own chooser gets the message", async () => {
        const tab = { close: vi.fn(), location: { href: "" }, opener: {} };
        vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
        shareInvoice.mockResolvedValue({
            ok: true,
            data: { whatsappUrl: null, text: "Thank you, Vivek" },
        });
        await openWhatsAppShare("inv_1", "RECEIPT");
        expect(tab.location.href).toBe(
            "https://wa.me/?text=Thank%20you%2C%20Vivek",
        );
    });

    it("a refused share closes the tab and says why", async () => {
        const tab = { close: vi.fn(), location: { href: "" }, opener: {} };
        vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
        shareInvoice.mockResolvedValue({
            ok: false,
            error: "Reminded today. Next one tomorrow.",
        });
        expect(await openWhatsAppShare("inv_1", "REMINDER")).toBe(false);
        expect(tab.close).toHaveBeenCalled();
        expect(toast.showError).toHaveBeenCalledWith(
            "Reminded today. Next one tomorrow.",
        );
    });
});
