// @vitest-environment jsdom
/**
 * The inbox's rows (10 Oct 2026): every one is a link to the thing it is
 * about, opening one reads it with no other signal, unread is a quiet dot
 * and never a warning, rows are grouped Today and Earlier with relative
 * times, and "Mark all as read" can be undone.
 */
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn() }),
    unstable_rethrow: () => undefined,
}));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...rest
    }: {
        href: string;
        children: ReactNode;
    }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));

const markRead = vi.fn();
const markAll = vi.fn();
const undoAll = vi.fn();
vi.mock("@/lib/notifications/actions", () => ({
    markNotificationRead: (id: string) => markRead(id) as unknown,
    markAllNotificationsRead: () => markAll() as unknown,
    undoMarkAllNotificationsRead: (at: string) => undoAll(at) as unknown,
}));

const toasts = {
    success: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string) => void>(),
    undo: vi.fn<(message: string, undo: () => unknown) => void>(),
};
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (message: string) => {
        toasts.success(message);
    },
    showError: (message: string) => {
        toasts.error(message);
    },
    showUndo: (message: string, undo: () => unknown) => {
        toasts.undo(message, undo);
    },
}));

import { BusinessZoneProvider } from "@/components/shared/business-zone";
import { UNREACHED } from "@/lib/api/unreached";
import type { Notification } from "@/lib/notifications/service";

import { NotificationsInbox } from "./notifications-inbox";

const NOW = "2026-10-10T09:30:00.000Z"; // 3:00 pm in Kolkata
const at = (minutesAgo: number) =>
    new Date(Date.parse(NOW) - minutesAgo * 60_000).toISOString();

const notice = (over: Partial<Notification>): Notification => ({
    id: "n",
    type: "order.new",
    title: "New order ORD-012 from Asha Rao",
    body: "₹1,240.00, paid online.",
    leadId: null,
    reviewId: null,
    readAt: null,
    createdAt: at(5),
    ...over,
});

const ORDER = notice({
    id: "n-order",
    target: { kind: "order", id: "ord_1" },
});
const BOOKING = notice({
    id: "n-booking",
    type: "booking.new",
    title: "Asha Rao booked a Check-up",
    body: "Tue 13 Oct at 11:00.",
    target: { kind: "booking", id: "bk_1" },
    createdAt: at(120),
});
const REVIEW = notice({
    id: "n-review",
    type: "review.needs-reply",
    title: "A 2-star review of Sourdough loaf",
    body: "Arrived late.",
    reviewId: "rev_1",
    target: { kind: "review", id: "rev_1" },
    createdAt: at(3 * 24 * 60),
});
const READ = notice({
    id: "n-read",
    type: "team.joined",
    title: "Meera joined the team",
    body: null,
    target: { kind: "team", id: null },
    readAt: at(60),
    createdAt: at(26 * 60),
});

let root: Root;
let host: HTMLDivElement;

function draw(notifications: Notification[]) {
    act(() =>
        root.render(
            <BusinessZoneProvider zone="Asia/Kolkata">
                <NotificationsInbox
                    notifications={notifications}
                    businessName="Rye & Co"
                    now={NOW}
                />
            </BusinessZoneProvider>,
        ),
    );
}

const link = (id: string) => {
    const el = Array.from(host.querySelectorAll("a")).find((a) =>
        a.getAttribute("aria-label")?.includes(TITLES[id] ?? "\u0000"),
    );
    if (!el) throw new Error(`no row for ${id}`);
    return el;
};
const TITLES: Record<string, string> = {
    order: "New order ORD-012",
    booking: "booked a Check-up",
    review: "2-star review",
    read: "Meera joined",
};
const press = (el: Element) =>
    act(() => {
        el.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
    });
const settle = () => act(async () => Promise.resolve());

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    for (const mock of [refresh, markRead, markAll, undoAll]) mock.mockReset();
    for (const mock of Object.values(toasts)) mock.mockReset();
    markRead.mockResolvedValue({ ok: true, data: { id: "x" } });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    // jsdom would try to follow the link.
    host.addEventListener("click", (e) => e.preventDefault());
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
});

describe("every row opens the thing it is about", () => {
    it("a new order opens the order, a new booking the booking", () => {
        draw([ORDER, BOOKING]);
        expect(link("order").getAttribute("href")).toBe(
            "/commerce/orders/ord_1",
        );
        expect(link("booking").getAttribute("href")).toBe("/bookings/bk_1");
    });

    it("no row is a bare button or plain text: each is a link with somewhere to go", () => {
        draw([ORDER, BOOKING, REVIEW, READ]);
        const rows = Array.from(host.querySelectorAll("li"));
        expect(rows).toHaveLength(4);
        for (const row of rows) {
            const a = row.querySelector("a");
            expect(a?.getAttribute("href")).toMatch(/^\//);
            expect(row.querySelector("button")).toBeNull();
        }
    });

    it("even a row nobody can place goes somewhere", () => {
        draw([notice({ id: "odd", type: "something.new", title: "Odd" })]);
        expect(host.querySelector("a")?.getAttribute("href")).toBe("/");
    });
});

describe("opening a row is reading it", () => {
    it("marks it read, with one signal: the dot goes, and nothing is toasted", async () => {
        draw([ORDER, BOOKING]);
        expect(host.querySelectorAll("[data-unread-dot]")).toHaveLength(2);
        expect(host.textContent).toContain("2 unread");

        press(link("order"));
        await settle();

        expect(markRead).toHaveBeenCalledTimes(1);
        expect(markRead).toHaveBeenCalledWith("n-order");
        expect(host.querySelectorAll("[data-unread-dot]")).toHaveLength(1);
        expect(host.textContent).toContain("1 unread");
        expect(toasts.success).not.toHaveBeenCalled();
        expect(toasts.error).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
    });

    it("a review's notice is read by opening it too, so the count means one thing", async () => {
        draw([REVIEW]);
        press(link("review"));
        await settle();
        expect(markRead).toHaveBeenCalledWith("n-review");
        expect(host.querySelector("[data-unread-dot]")).toBeNull();
    });

    it("a row already read isn't marked again", async () => {
        draw([READ]);
        press(link("read"));
        await settle();
        expect(markRead).not.toHaveBeenCalled();
    });

    it("a save that didn't get there says nothing here: the link is already going", async () => {
        markRead.mockRejectedValue(new TypeError("Failed to fetch"));
        draw([ORDER]);
        press(link("order"));
        await settle();
        expect(toasts.error).not.toHaveBeenCalled();
    });
});

describe("how a row looks", () => {
    it("unread is a neutral dot, never a warning tag", () => {
        draw([ORDER, READ]);
        const dot = host.querySelector("[data-unread-dot]");
        expect(dot?.className).toContain("bg-foreground");
        expect(host.innerHTML).not.toMatch(/warning|amber|yellow/);
        expect(host.textContent).not.toContain("Unread");
        // Said to a screen reader in the row's name instead.
        expect(link("order").getAttribute("aria-label")).toContain(", unread");
        expect(link("read").getAttribute("aria-label")).not.toContain("unread");
    });

    it("groups rows Today and Earlier, by the business's day", () => {
        draw([ORDER, BOOKING, READ, REVIEW]);
        const cards = Array.from(host.querySelectorAll("ul")).map((ul) => ({
            heading: ul.previousElementSibling?.textContent ?? "",
            rows: ul.querySelectorAll("li").length,
        }));
        expect(cards).toHaveLength(2);
        expect(cards[0]?.heading).toContain("Today");
        expect(cards[0]?.rows).toBe(2);
        expect(cards[1]?.heading).toContain("Earlier");
        expect(cards[1]?.rows).toBe(2);
    });

    it("leaves out a group with nothing in it", () => {
        draw([REVIEW]);
        expect(host.textContent).not.toContain("Today");
        expect(host.textContent).toContain("Earlier");
    });

    it("says how long ago, and keeps the exact moment on the time itself", () => {
        draw([ORDER, BOOKING, READ, REVIEW]);
        const times = Array.from(host.querySelectorAll("time"));
        expect(times.map((t) => t.textContent)).toEqual([
            "5 min ago",
            "2 hr ago",
            "Yesterday",
            "3 days ago",
        ]);
        expect(times[0]?.getAttribute("datetime")).toBe(ORDER.createdAt);
        expect(times[0]?.getAttribute("title")).toMatch(/10 Oct 2026/);
    });

    it("the time moves on while the page is open", () => {
        draw([ORDER]);
        act(() => void vi.advanceTimersByTime(3 * 60_000));
        expect(host.querySelector("time")?.textContent).toBe("8 min ago");
    });
});

describe("Mark all as read", () => {
    it("offers Undo, which gives back what that press marked", async () => {
        markAll.mockResolvedValue({
            ok: true,
            data: { updated: 2, readAt: "2026-10-10T09:30:01.000Z" },
        });
        undoAll.mockResolvedValue({ ok: true, data: { updated: 2 } });
        draw([ORDER, BOOKING]);
        const button = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent === "Mark all as read",
        );
        if (!button) throw new Error("no Mark all as read");

        press(button);
        await settle();

        expect(markAll).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledTimes(1);
        // One signal, and it carries the way back.
        expect(toasts.success).not.toHaveBeenCalled();
        expect(toasts.undo).toHaveBeenCalledTimes(1);
        const [said, undo] = toasts.undo.mock.calls[0] ?? [];
        expect(said).toBe("All notifications marked as read.");

        const outcome = await (undo as () => Promise<unknown>)();
        expect(undoAll).toHaveBeenCalledWith("2026-10-10T09:30:01.000Z");
        expect(outcome).toBe(true);
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("an Undo that never got there says so, as a failed Undo", async () => {
        markAll.mockResolvedValue({
            ok: true,
            data: { updated: 1, readAt: "2026-10-10T09:30:01.000Z" },
        });
        undoAll.mockRejectedValue(new TypeError("Failed to fetch"));
        draw([ORDER]);
        press(
            Array.from(host.querySelectorAll("button")).find(
                (b) => b.textContent === "Mark all as read",
            ) as Element,
        );
        await settle();
        const undo = toasts.undo.mock.calls[0]?.[1] as () => Promise<unknown>;
        expect(await undo()).toEqual({ ok: false, error: UNREACHED });
    });

    it("an API that can't undo it yet just says it is done", async () => {
        markAll.mockResolvedValue({
            ok: true,
            data: { updated: 1, readAt: null },
        });
        draw([ORDER]);
        press(
            Array.from(host.querySelectorAll("button")).find(
                (b) => b.textContent === "Mark all as read",
            ) as Element,
        );
        await settle();
        expect(toasts.undo).not.toHaveBeenCalled();
        expect(toasts.success).toHaveBeenCalledWith(
            "All notifications marked as read.",
        );
    });

    it("isn't offered with nothing unread", () => {
        draw([READ]);
        expect(host.textContent).not.toContain("Mark all as read");
    });
});

describe("no notifications", () => {
    it("says so, naming the business", () => {
        draw([]);
        expect(host.textContent).toContain("No notifications yet");
        expect(host.textContent).toContain("Rye & Co");
    });
});
