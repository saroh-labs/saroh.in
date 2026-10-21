import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

/** A home whose hero draws its way in as a live fact (U8). */
function LiveHome({ fact }: { fact: "loading" | "fresh" }) {
    useBookReturnFocus("/");
    return (
        <main>
            <a href="/book">Book</a>
            <div data-site-next-free="">
                {fact === "loading" ? (
                    <a href="/book">See times</a>
                ) : (
                    <a href="/book?service=svc_walk&start=09%3A00">
                        Book this time
                    </a>
                )}
            </div>
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

    it("follows the hero's live link as it is drawn and swapped", async () => {
        const first = render(<LiveHome fact="fresh" />);
        const link = screen.getByRole("link", { name: "Book this time" });
        link.addEventListener("click", (e) => e.preventDefault());
        fireEvent.click(link);
        first.unmount();

        const closing = render(<Closer />);
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        closing.unmount();

        // Landing: the read is out, so the slot says See times.
        const back = render(<LiveHome fact="loading" />);
        expect(document.activeElement).toBe(
            screen.getByRole("link", { name: "See times" }),
        );
        // The time lands: focus goes with the slot, not to the header's Book.
        back.rerender(<LiveHome fact="fresh" />);
        await waitFor(() =>
            expect(document.activeElement).toBe(
                screen.getByRole("link", { name: "Book this time" }),
            ),
        );
        back.unmount();
    });

    it("leaves focus where the visitor moved it", async () => {
        const first = render(<LiveHome fact="fresh" />);
        const link = screen.getByRole("link", { name: "Book this time" });
        link.addEventListener("click", (e) => e.preventDefault());
        fireEvent.click(link);
        first.unmount();

        const closing = render(<Closer />);
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        closing.unmount();

        const back = render(<LiveHome fact="loading" />);
        const header = screen.getByRole("link", { name: "Book" });
        header.focus();
        back.rerender(<LiveHome fact="fresh" />);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(document.activeElement).toBe(header);
        back.unmount();
    });
});
