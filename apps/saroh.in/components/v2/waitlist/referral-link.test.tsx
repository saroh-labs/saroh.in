// @vitest-environment jsdom
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTags, syncTags } from "@/lib/tags";

import { ReferralLink } from "./referral-link";

/** The referral link (plan U30): Copy, then "Copied", and one GA event. */
const gtag = vi.fn();
const writeText = vi.fn();

beforeEach(() => {
    // Visit counts accepted: events go to this Analytics id (`lib/tags.ts`).
    resetTags();
    syncTags({ gaId: "G-TEST123" }, { analytics: true, ads: false });
    window.gtag = gtag;
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
    });
});

afterEach(() => {
    cleanup();
    gtag.mockReset();
    writeText.mockReset();
});

const LINK = {
    href: "https://www.saroh.in/waitlist?ref=abcdefgh",
    shown: "saroh.in/waitlist?ref=abcdefgh",
};

describe("ReferralLink", () => {
    it("shows the short link and copies the full one", async () => {
        writeText.mockResolvedValue(undefined);
        render(<ReferralLink {...LINK} />);
        expect(screen.getByText(LINK.shown)).toBeTruthy();

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Copy" }));
            await Promise.resolve();
        });

        expect(writeText).toHaveBeenCalledWith(LINK.href);
        expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
        expect(gtag).toHaveBeenCalledWith("event", "referral_copy", {
            send_to: "G-TEST123",
            page_location: expect.any(String) as unknown,
        });
    });

    it("selects the link when the clipboard is refused", async () => {
        writeText.mockRejectedValue(new Error("denied"));
        render(<ReferralLink {...LINK} />);

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Copy" }));
            await Promise.resolve();
        });

        expect(window.getSelection()?.toString()).toBe(LINK.shown);
        expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
        expect(gtag).not.toHaveBeenCalled();
    });
});
