// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CourierPanel } from "./courier-panel";

/**
 * The courier sheet says what reaches the customer (U16, #1147): the
 * handover's email carries the tracking; tracking added later is told while
 * the business sends delivery updates; with no email connected nothing is
 * promised.
 */

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
});

function render(props: Partial<Parameters<typeof CourierPanel>[0]>) {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
        root?.render(
            <CourierPanel
                open
                mode="change"
                to="12 Church Street, Bengaluru"
                first="Asha"
                busy={false}
                before={{ courier: "Delhivery", number: null, url: null }}
                onCancel={vi.fn()}
                onSave={vi.fn()}
                {...props}
            />,
        ),
    );
    return document.body.textContent;
}

describe("the courier sheet's promise (U16)", () => {
    it("Tracking, delivery updates on and an email going: the customer gets it by email", () => {
        const text = render({ reach: "EMAIL", deliveryUpdates: true });
        expect(text).toContain("Asha gets new tracking by email.");
        expect(text).not.toContain("Nothing is sent");
    });

    it("Tracking, no email connected: nothing is promised", () => {
        const text = render({ reach: "NONE", deliveryUpdates: true });
        expect(text).toContain("Nothing is sent to Asha.");
        expect(text).not.toMatch(/by email/);
    });

    it("Tracking, delivery updates off: says so", () => {
        const text = render({ reach: "EMAIL", deliveryUpdates: false });
        expect(text).toContain(
            "Nothing is sent to Asha: delivery updates are off.",
        );
    });

    it("Hand to courier: the handover's email carries the tracking, at their address", () => {
        const text = render({
            mode: "handover",
            before: undefined,
            reach: "EMAIL",
            noticeTo: "asha@example.com",
        });
        expect(text).toContain(
            "Asha gets the tracking with the handover by email, at asha@example.com.",
        );
    });
});
