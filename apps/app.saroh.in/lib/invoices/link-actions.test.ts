import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    createPayLink,
    createViewLink,
    remindInvoice,
    sendInvoice,
    shareInvoice,
} from "./actions";
import {
    newPayLink,
    newViewLink,
    remindWithLink,
    sendWithLink,
    shareWithLink,
} from "./link-actions";
import { forgetLinks, mintedLink, rememberLink } from "./minted-links";

vi.mock("./actions", () => ({
    createPayLink: vi.fn(),
    createViewLink: vi.fn(),
    remindInvoice: vi.fn(),
    sendInvoice: vi.fn(),
    shareInvoice: vi.fn(),
}));

/**
 * #870: every action that replaces an invoice's link token keeps this tab's
 * memory in step, so "Show link again" never shows a dead link.
 */

const OLD = "https://rye.saroh.app/pay/old";
const sent = {
    ok: true as const,
    data: { channels: ["email"], email: null, thread: false },
};
const refused = { ok: false as const, error: "Already paid." };

describe("actions that replace the link", () => {
    beforeEach(() => {
        forgetLinks();
        vi.mocked(createPayLink).mockReset();
        vi.mocked(createViewLink).mockReset();
        vi.mocked(sendInvoice).mockReset();
        vi.mocked(remindInvoice).mockReset();
        rememberLink("inv_1", OLD);
    });

    it("after a send, the link is forgotten", async () => {
        vi.mocked(sendInvoice).mockResolvedValue(sent as never);
        await sendWithLink("inv_1");
        expect(mintedLink("inv_1")).toBeNull();
    });

    it("after a reminder, the link is forgotten", async () => {
        vi.mocked(remindInvoice).mockResolvedValue(sent as never);
        await remindWithLink("inv_1");
        expect(mintedLink("inv_1")).toBeNull();
    });

    it("after a view link, the payment link is forgotten", async () => {
        vi.mocked(createViewLink).mockResolvedValue({
            ok: true,
            data: { url: "https://rye.saroh.app/pay/view" },
        } as never);
        await newViewLink("inv_1");
        expect(mintedLink("inv_1")).toBeNull();
    });

    it("a refused send keeps it: nothing replaced it", async () => {
        vi.mocked(sendInvoice).mockResolvedValue(refused);
        await sendWithLink("inv_1");
        expect(mintedLink("inv_1")).toBe(OLD);
    });

    it("a new payment link is remembered in place of the old", async () => {
        vi.mocked(createPayLink).mockResolvedValue({
            ok: true,
            data: { url: "https://rye.saroh.app/pay/new" },
        } as never);
        await newPayLink("inv_1");
        expect(mintedLink("inv_1")).toBe("https://rye.saroh.app/pay/new");
    });

    it("a new payment link keeps the date the API made it on (#870)", async () => {
        const made = "2026-10-08T10:00:00.000Z";
        vi.mocked(createPayLink).mockResolvedValue({
            ok: true,
            data: { url: "https://rye.saroh.app/pay/new", payLinkMadeAt: made },
        } as never);
        await newPayLink("inv_1", "2026-10-08T09:00:00.000Z");
        // A later edit to the invoice doesn't end it; a later link does.
        const read = {
            standing: "ISSUED",
            updatedAt: "2026-10-08T11:00:00.000Z",
        };
        expect(mintedLink("inv_1", { ...read, payLinkMadeAt: made })).toBe(
            "https://rye.saroh.app/pay/new",
        );
        expect(
            mintedLink("inv_1", {
                ...read,
                payLinkMadeAt: "2026-10-08T11:00:00.000Z",
            }),
        ).toBeNull();
    });

    it("only the invoice acted on forgets", async () => {
        rememberLink("inv_2", OLD);
        vi.mocked(sendInvoice).mockResolvedValue(sent as never);
        await sendWithLink("inv_1");
        expect(mintedLink("inv_2")).toBe(OLD);
    });
});

describe("sharing by hand (DEC-173, U11)", () => {
    const share = (over: Record<string, unknown>) =>
        ({
            ok: true,
            data: {
                channel: "LINK",
                kind: "NEW",
                url: "https://rye.saroh.app/pay/shared",
                text: "Hi",
                phone: null,
                whatsappUrl: null,
                payOnline: true,
                email: null,
                sharedAt: "2026-10-20T06:30:00.000Z",
                ...over,
            },
        }) as never;

    beforeEach(() => {
        forgetLinks();
        vi.mocked(shareInvoice).mockReset();
    });

    it("a payment link made by a share is remembered to show again", async () => {
        rememberLink("inv_1", OLD);
        vi.mocked(shareInvoice).mockResolvedValue(share({}));
        await shareWithLink("inv_1", { channel: "LINK", kind: "NEW" });
        expect(mintedLink("inv_1")).toBe("https://rye.saroh.app/pay/shared");
    });

    it("a view link made by a share ends the payment link kept here", async () => {
        rememberLink("inv_1", OLD);
        vi.mocked(shareInvoice).mockResolvedValue(share({ payOnline: false }));
        await shareWithLink("inv_1", { channel: "WHATSAPP", kind: "NEW" });
        expect(mintedLink("inv_1")).toBeNull();
    });

    it("PDF and print make no link and leave the one kept here", async () => {
        rememberLink("inv_1", OLD);
        vi.mocked(shareInvoice).mockResolvedValue(
            share({ channel: "PDF", url: null, text: null }),
        );
        await shareWithLink("inv_1", { channel: "PDF", kind: "NEW" });
        expect(mintedLink("inv_1")).toBe(OLD);
    });
});
