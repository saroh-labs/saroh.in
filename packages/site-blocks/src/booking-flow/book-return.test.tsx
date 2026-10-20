import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
    opensBooking,
    useBookReturnFocus,
    useCloseBooking,
} from "./book-return";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: router.replace }),
}));

/**
 * Leaving the booking (plan U10): Close goes back where it was opened
 * from with `replace`, and focus lands on the link that opened it.
 */

function Home({ path }: { path: string }) {
    useBookReturnFocus(path);
    return (
        <main>
            <a href="/about">About</a>
            <a href="/book?service=svc_private">Book a private session</a>
        </main>
    );
}

function Closer() {
    const close = useCloseBooking();
    return (
        <button type="button" onClick={close}>
            Close
        </button>
    );
}

describe("leaving the booking", () => {
    it("knows a link that opens the booking", () => {
        const o = "https://prana.example.com";
        expect(opensBooking("/book?service=x", o)).toBe(true);
        expect(opensBooking("/about", o)).toBe(false);
        expect(opensBooking("https://other.example.com/book", o)).toBe(false);
    });

    it("replaces the address with home when the visitor came from elsewhere", () => {
        render(<Closer />);
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(router.replace).toHaveBeenCalledWith("/");
    });

    it("puts focus back on the link that opened it", () => {
        const first = render(<Home path="/" />);
        const link = screen.getByRole("link", {
            name: "Book a private session",
        });
        link.addEventListener("click", (e) => e.preventDefault());
        fireEvent.click(link);
        first.unmount();

        const closing = render(<Closer />);
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        closing.unmount();

        render(<Home path="/" />);
        expect(document.activeElement).toBe(
            screen.getByRole("link", { name: "Book a private session" }),
        );
    });
});
