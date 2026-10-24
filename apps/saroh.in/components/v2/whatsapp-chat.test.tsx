// @vitest-environment jsdom
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { track } from "@/lib/analytics";
import { writeChoices, writeConsent } from "@/lib/consent";

import { pageKind, WhatsAppChat, whatsappNumber } from "./whatsapp-chat";

/** The floating WhatsApp button (#1188), dev only until the real number is connected. */
vi.mock("next/navigation", () => ({ usePathname: () => "/pricing" }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

beforeEach(() => writeConsent(null));
afterEach(() => {
    cleanup();
    vi.mocked(track).mockClear();
});

const link = () =>
    screen.getByRole("link", { name: "Chat with us on WhatsApp" });

describe("whatsappNumber", () => {
    it("is the number only when the switch is on and the number is digits", () => {
        expect(whatsappNumber("on", "910000000000")).toBe("910000000000");
        expect(whatsappNumber("off", "910000000000")).toBeNull();
        expect(whatsappNumber(undefined, "910000000000")).toBeNull();
        expect(whatsappNumber("on", undefined)).toBeNull();
        expect(whatsappNumber("on", "+91 00000")).toBeNull();
    });
});

describe("pageKind", () => {
    it("is the first segment, home for /", () => {
        expect(pageKind("/")).toBe("home");
        expect(pageKind("/features/bookings")).toBe("features");
    });
});

describe("WhatsAppChat", () => {
    it("links wa.me with the digits and a message naming the page, in a new tab", () => {
        render(<WhatsAppChat number="910000000000" asksConsent={false} />);
        const href = link().getAttribute("href") ?? "";
        expect(href).toBe(
            `https://wa.me/910000000000?text=${encodeURIComponent("Hi Saroh, I'm on saroh.in/pricing and have a question.")}`,
        );
        expect(link().getAttribute("target")).toBe("_blank");
        expect(link().getAttribute("rel")).toContain("noopener");
    });

    it("renders nothing without a number (switch off, or none set)", () => {
        const { container } = render(
            <WhatsAppChat number={null} asksConsent />,
        );
        expect(container.innerHTML).toBe("");
    });

    it("lifts above the cookie notice while an answer is open, and drops once answered", () => {
        render(<WhatsAppChat number="910000000000" asksConsent />);
        expect(link().getAttribute("data-lifted")).toBe("true");
        expect(link().style.getPropertyValue("--notice-h")).toBe("0px");
        act(() => writeChoices({ analytics: "refused", ads: "refused" }));
        // A refusal of the first answer covers recording too: nothing is open.
        expect(link().getAttribute("data-lifted")).toBeNull();
    });

    it("never lifts where the notice asks nothing", () => {
        render(<WhatsAppChat number="910000000000" asksConsent={false} />);
        expect(link().getAttribute("data-lifted")).toBeNull();
    });

    it("sends whatsapp_click with the page's kind on click", () => {
        render(<WhatsAppChat number="910000000000" asksConsent={false} />);
        fireEvent.click(link());
        expect(track).toHaveBeenCalledWith("whatsapp_click", {
            page: "pricing",
        });
    });
});
