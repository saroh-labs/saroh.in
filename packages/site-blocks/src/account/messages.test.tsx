import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountMessages } from "./messages";
import type { AccountMessage, AccountThread, Block } from "./model";
import { messageMeta } from "./model";
import { AccountTabBar } from "./tab-bar";

/**
 * Messages in the customer's account (round-2 A13) in jsdom: the thread
 * drawn as text, sending through the site's action, a refusal kept beside
 * the words, a failed read said plainly, and the tab's unread dot.
 */

let pathname = "/account";
vi.mock("next/navigation", () => ({
    usePathname: () => pathname,
}));

const FROM_THEM: AccountMessage = {
    ref: "m1",
    from: "business",
    text: "Hi Farah, your crown is ready to fit.",
    sentAt: "2026-10-04T09:00:00.000Z",
};
const FROM_ME: AccountMessage = {
    ref: "m2",
    from: "me",
    text: "<b>Thanks!</b>\nSee you Tuesday.",
    sentAt: "2026-10-04T10:00:00.000Z",
};

function thread(messages: AccountMessage[]): Block<AccountThread> {
    return { ok: true, value: { messages, earlier: false } };
}

describe("messageMeta", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    it("says who, and when: a time today, Yesterday, else the day", () => {
        expect(
            messageMeta(
                { ...FROM_ME, sentAt: "2026-10-05T09:05:00Z" },
                "Kavi Dental",
                now,
                "UTC",
            ),
        ).toBe("You · 9:05 am");
        expect(messageMeta(FROM_THEM, "Kavi Dental", now, "UTC")).toBe(
            "Kavi Dental · Yesterday",
        );
        expect(
            messageMeta(
                { ...FROM_THEM, sentAt: "2026-09-28T09:00:00Z" },
                "Kavi Dental",
                now,
                "UTC",
            ),
        ).toBe("Kavi Dental · 28 Sept");
    });
});

describe("AccountMessages", () => {
    it("draws the thread as text, theirs and mine", () => {
        render(
            <AccountMessages
                businessName="Kavi Dental"
                thread={thread([FROM_THEM, FROM_ME])}
                api={{ send: vi.fn() }}
            />,
        );
        const list = screen.getByRole("list", {
            name: "Messages with Kavi Dental",
        });
        expect(list.children).toHaveLength(2);
        // Plain text: the tags are shown as written, never made into HTML.
        expect(screen.getByText(/<b>Thanks!<\/b>/)).toBeTruthy();
        expect(list.querySelector("b")).toBeNull();
    });

    it("an empty thread invites the first message", () => {
        render(
            <AccountMessages
                businessName="Kavi Dental"
                thread={thread([])}
                api={{ send: vi.fn() }}
            />,
        );
        expect(screen.getByText(/Write to Kavi Dental here/)).toBeTruthy();
        const send = screen.getByRole("button", { name: "Send" });
        expect((send as HTMLButtonElement).disabled).toBe(true);
    });

    it("sends through the site's action and shows the message", async () => {
        const send = vi.fn().mockResolvedValue({
            ok: true,
            message: {
                ref: "m3",
                from: "me",
                text: "Can I come at 11?",
                sentAt: new Date().toISOString(),
            },
        });
        render(
            <AccountMessages
                businessName="Kavi Dental"
                thread={thread([FROM_THEM])}
                api={{ send }}
            />,
        );
        const box = screen.getByRole("textbox", { name: "Message" });
        fireEvent.change(box, { target: { value: "  Can I come at 11?  " } });
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        await waitFor(() =>
            expect(screen.getByText("Can I come at 11?")).toBeTruthy(),
        );
        expect(send).toHaveBeenCalledWith("Can I come at 11?");
        expect((box as HTMLInputElement).value).toBe("");
    });

    it("a refusal is said, and the words stay in the box", async () => {
        const send = vi.fn().mockResolvedValue({
            ok: false,
            message:
                "You're sending messages quickly. Wait a minute, then try again.",
        });
        render(
            <AccountMessages
                businessName="Kavi Dental"
                thread={thread([])}
                api={{ send }}
            />,
        );
        const box = screen.getByRole("textbox", { name: "Message" });
        fireEvent.change(box, { target: { value: "Hello" } });
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        await waitFor(() =>
            expect(screen.getByRole("alert").textContent).toContain(
                "Wait a minute",
            ),
        );
        expect((box as HTMLInputElement).value).toBe("Hello");
    });

    it("a failed read says so, and can't be written in", () => {
        render(
            <AccountMessages
                businessName="Kavi Dental"
                thread={{ ok: false }}
                api={{ send: vi.fn() }}
            />,
        );
        expect(
            screen.getByText(/Your messages couldn't be loaded/),
        ).toBeTruthy();
        const box = screen.getByRole<HTMLInputElement>("textbox", {
            name: "Message",
        });
        expect(box.disabled).toBe(true);
    });
});

describe("the Messages tab's dot", () => {
    const tabs = [
        { key: "home" as const, label: "Home" },
        { key: "messages" as const, label: "Messages" },
        { key: "me" as const, label: "Your details" },
    ];

    it("shows while something is unread, and never on Messages itself", () => {
        pathname = "/account";
        const { unmount } = render(
            <AccountTabBar tabs={tabs} unreadMessages={2} />,
        );
        expect(
            screen.getByRole("link", { name: /^Messages \(2 new\)$/ }),
        ).toBeTruthy();
        unmount();

        pathname = "/account/messages";
        const { rerender } = render(
            <AccountTabBar tabs={tabs} unreadMessages={2} />,
        );
        expect(screen.getByRole("link", { name: "Messages" }).textContent).toBe(
            "Messages",
        );

        // Back to Home: the layout's count is stale, but they've opened it.
        pathname = "/account";
        rerender(<AccountTabBar tabs={tabs} unreadMessages={2} />);
        expect(screen.getByRole("link", { name: "Messages" })).toBeTruthy();

        // Something new since: the dot comes back.
        rerender(<AccountTabBar tabs={tabs} unreadMessages={3} />);
        expect(
            screen.getByRole("link", { name: /^Messages \(3 new\)$/ }),
        ).toBeTruthy();
    });
});

describe("the tab bar's labels", () => {
    const SIX = [
        { key: "home", label: "Home" },
        { key: "bookings", label: "Bookings" },
        { key: "orders", label: "Orders" },
        { key: "plan", label: "Plan" },
        { key: "messages", label: "Messages" },
        { key: "me", label: "Your details" },
    ] as const;

    it("each keeps to its column, and a two-word label takes two lines rather than being cut", () => {
        pathname = "/account";
        render(<AccountTabBar tabs={[...SIX]} />);
        const link = screen.getByRole("link", { name: "Your details" });
        // The whole words are its name and what is drawn: never "Your det…".
        const label = link.querySelector("span");
        expect(label?.textContent).toBe("Your details");
        expect(label?.className).toMatch(/\bw-full\b/);
        expect(label?.className).not.toMatch(/\btruncate\b/);
        expect(label?.className).toMatch(/overflow-hidden/);
    });

    it("is one nav at every width, before the page: a bar on a phone, a row beyond it (DEC-142)", () => {
        pathname = "/account/orders";
        render(<AccountTabBar tabs={[...SIX]} />);
        const nav = screen.getByRole("navigation", { name: "Account" });
        // Fixed to the foot on a phone; from tablet width up, a row that
        // stays at the top. One element, so one order in the page.
        expect(nav.className).toMatch(/\bfixed\b/);
        expect(nav.className).toMatch(/\bbottom-0\b/);
        expect(nav.className).toMatch(/\bmd:sticky\b/);
        expect(nav.className).toMatch(/\bmd:top-0\b/);
        expect(screen.getAllByRole("navigation")).toHaveLength(1);
        expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute(
            "aria-current",
        );
    });

    it("an order's or a booking's own page keeps its tab marked", () => {
        pathname = "/account/orders/ord_1";
        render(<AccountTabBar tabs={[...SIX]} />);
        expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute(
            "aria-current",
            "page",
        );
    });
});
