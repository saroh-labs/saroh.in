// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GoogleCalendarLine } from "./google-calendar-line";

vi.mock("@/components/settings/google-calendar/use-connect", () => ({
    useConnect: () => ({ busy: false, go: vi.fn() }),
}));
vi.mock("@saroh/ui/toast", () => ({ showError: vi.fn() }));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("Bookings' Google Calendar line (DEC-234)", () => {
    it("is one line with Connect and a dismiss, put away for this person", () => {
        act(() =>
            root.render(
                <GoogleCalendarLine line={{ kind: "connect" }} userId="u1" />,
            ),
        );
        const line = host.querySelector("[data-google-calendar-line]");
        expect(line?.querySelectorAll("p")).toHaveLength(1);
        expect(line?.textContent).toContain(
            "Put your bookings on Google Calendar",
        );
        expect(line?.textContent).toContain("Connect");
        const dismiss = line?.querySelector<HTMLButtonElement>(
            'button[aria-label="Dismiss"]',
        );
        act(() => dismiss?.click());
        expect(host.querySelector("[data-google-calendar-line]")).toBeNull();
    });

    it("says a lapsed account on one line, with Manage", () => {
        act(() =>
            root.render(
                <GoogleCalendarLine
                    line={{ kind: "lapsed", email: "asha@example.com" }}
                    userId="u1"
                />,
            ),
        );
        const line = host.querySelector("[data-google-calendar-line]");
        expect(line?.textContent).toContain("asha@example.com");
        expect(line?.querySelector("a")?.textContent).toBe("Manage");
    });
});
