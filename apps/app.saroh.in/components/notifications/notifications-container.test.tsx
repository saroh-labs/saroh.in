// @vitest-environment jsdom
/**
 * Notifications on React Query (DEC-259), in the browser: the inbox is a
 * skeleton until its read lands (no rows, no Mark all); Mark all as read
 * reads the inbox and the shell's live read (the bell) once each, and a
 * refused one reads nothing; a revisit within the live tier's fresh time
 * reads nothing.
 */
import { useQuery } from "@tanstack/react-query";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined }));
vi.mock("@/lib/api/http", () => ({}));
const markAll = vi.fn();
vi.mock("@/lib/notifications/actions", () => ({
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: (orgId: string) => markAll(orgId) as unknown,
    undoMarkAllNotificationsRead: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showUndo: vi.fn(),
}));

import { NotificationsContainer } from "@/components/notifications/notifications-container";
import { BusinessZoneProvider } from "@/components/shared/dates/business-zone";
import { domainKey } from "@/lib/query/keys";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";
import { shellLiveRead } from "@/lib/shell/queries";

const NOW = "2026-11-25T10:00:00.000Z";
const ROW = {
    id: "n1",
    type: "order.new",
    title: "New order ORD-012",
    body: null,
    leadId: null,
    reviewId: null,
    contactId: null,
    target: { kind: "order", id: "o1" },
    readAt: null,
    createdAt: NOW,
};

let release: () => void;
const reads: string[] = [];
const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

beforeEach(() => {
    reads.length = 0;
    markAll.mockReset();
    const held = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            reads.push(url.split("?")[0] ?? url);
            await held;
            const body = url.startsWith("/api/shell/live")
                ? { unread: 0, counts: {} }
                : [ROW];
            return new Response(JSON.stringify(body), { status: 200 });
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

const inbox = (
    <BusinessZoneProvider zone="Asia/Kolkata">
        <NotificationsContainer businessName="Northwind" now={NOW} />
    </BusinessZoneProvider>
);

const markAllButton = (host: HTMLElement) =>
    Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent === "Mark all as read",
    );

describe("the inbox", () => {
    it("draws skeleton rows, and no row or Mark all, until its read lands", async () => {
        const { host, unmount } = renderWithQuery(inbox);
        await tick();
        expect(host.querySelector('[data-slot="page-loading"]')).not.toBeNull();
        expect(host.textContent).not.toContain("New order ORD-012");
        expect(markAllButton(host)).toBeUndefined();

        release();
        await tick();
        expect(host.querySelector('[data-slot="page-loading"]')).toBeNull();
        expect(host.textContent).toContain("New order ORD-012");
        expect(reads).toEqual(["/api/notifications"]);
        unmount();
    });

    it("a revisit within its fresh time reads nothing", async () => {
        release();
        const client = makeTestClient();
        const first = renderWithQuery(inbox, { client });
        await tick();
        first.unmount();
        reads.length = 0;
        const again = renderWithQuery(inbox, { client });
        await tick();
        expect(reads).toEqual([]);
        expect(again.host.textContent).toContain("New order ORD-012");
        again.unmount();
    });
});

describe("Mark all as read", () => {
    async function pressed(result: unknown) {
        release();
        markAll.mockResolvedValue(result);
        const client = makeTestClient();
        // The bell's read, on screen in the shell.
        client.setQueryData(domainKey("shell", "org_1", "live"), {
            unread: 1,
            counts: {},
        });
        const { host, unmount } = renderWithQuery(
            <>
                {inbox}
                <Bell />
            </>,
            { client },
        );
        await tick();
        reads.length = 0;
        act(() => markAllButton(host)?.click());
        await tick();
        unmount();
        return reads.sort();
    }

    it("reads the inbox and the bell once each, passing the tab's business", async () => {
        const got = await pressed({
            ok: true,
            data: { updated: 1, readAt: NOW },
        });
        expect(markAll).toHaveBeenCalledWith("org_1");
        expect(got).toEqual(["/api/notifications", "/api/shell/live"]);
    });

    it("refused, reads nothing", async () => {
        const got = await pressed({ ok: false, error: "No" });
        expect(got).toEqual([]);
    });
});

/** The shell's bell: its live read, mounted as the shell mounts it. */
function Bell() {
    useQuery({ ...shellLiveRead.options("org_1", {}), staleTime: Infinity });
    return null;
}
