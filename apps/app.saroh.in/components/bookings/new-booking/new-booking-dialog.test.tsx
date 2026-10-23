// @vitest-environment jsdom
/**
 * A treatment's next visit (E10), kept beside New booking's journey (U8):
 * only the time is chosen, from the one time picker, and it is booked on
 * its order; a time taken meanwhile is said in the picker.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PickerSlot } from "@/lib/services/time-picker";

import { NewBookingDialog } from "./new-booking-dialog";

const listAvailability = vi.fn<() => Promise<PickerSlot[]>>();
const bookVisit = vi.fn();
vi.mock("@/lib/services/actions", () => ({
    listAvailability: () => listAvailability(),
    bookVisit: (...args: unknown[]) => bookVisit(...args) as unknown,
}));
vi.mock("@/components/billing/plan-refusal", () => ({
    showPlanRefusal: vi.fn(),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn() }),
}));
const showSuccess = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
    showError: vi.fn(),
}));

const ZONE = "Asia/Kolkata";
const at = (local: string) => new Date(`${local}:00+05:30`).toISOString();

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T03:00:00.000Z"));
    listAvailability.mockResolvedValue([
        {
            startAt: at("2026-10-19T12:15"),
            endAt: at("2026-10-19T13:00"),
            staffIds: ["p_meera"],
        },
    ]);
    bookVisit.mockReset();
    bookVisit.mockResolvedValue({ ok: true, data: { id: "bk_2" } });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.useRealTimers();
});

async function press(el: Element | null | undefined) {
    if (!(el instanceof HTMLElement)) throw new Error("Nothing to press");
    await act(async () => {
        el.click();
        await Promise.resolve();
        await Promise.resolve();
    });
}

const buttons = (within: ParentNode = document) =>
    Array.from(within.querySelectorAll("button"));

describe("Book visit N (E10)", () => {
    it("chooses only the time, and books it on the order", async () => {
        act(() =>
            root.render(
                <NewBookingDialog
                    services={[
                        {
                            id: "svc_t",
                            name: "Knee rehab",
                            timezone: ZONE,
                            minutes: 45,
                            priceCents: 300000,
                        },
                    ]}
                    visit={{
                        orderId: "ord_1",
                        orderNumber: "1042",
                        visitNumber: 2,
                        visits: 3,
                        who: "Kabir",
                    }}
                />,
            ),
        );
        await press(buttons().find((b) => b.textContent === "Book visit 2"));
        await act(async () => {
            await Promise.resolve();
        });
        const sheet = document.querySelector('[role="dialog"]');
        expect(sheet?.textContent).toContain("Book visit 2 of 3");
        expect(sheet?.textContent).toContain("paid for on order #1042");
        await press(
            buttons(sheet ?? document).find((b) =>
                b.textContent.startsWith("12:15 pm"),
            ),
        );
        await press(
            buttons(sheet ?? document).find(
                (b) => b.textContent === "Book visit",
            ),
        );
        expect(bookVisit).toHaveBeenCalledWith("ord_1", {
            visitNumber: 2,
            startAt: at("2026-10-19T12:15"),
        });
        expect(showSuccess).toHaveBeenCalledWith(
            "Visit booked.",
            expect.stringContaining("Visit 2 of 3 for Kabir"),
        );
    });
});
