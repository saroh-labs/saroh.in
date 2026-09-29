// @vitest-environment jsdom
/**
 * Subscription Detail's autopay actions (D14): Home's "Send a set-up link"
 * on an "Autopay limit too low" row arrives as `?do=autopay-link` and opens
 * the set-up sheet here — only where this screen offers it.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AutopayPanel } from "@/lib/subscriptions/autopay";
import type { AutopayCard } from "@/lib/subscriptions/service";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/subscriptions/actions", () => ({
    cancelAutopay: vi.fn(),
    sendAutopayLink: vi.fn(),
}));

import { AutopayActions } from "./autopay-panel";

const card: AutopayCard = {
    offered: true,
    methods: ["UPI", "CARD"],
    checks: {},
    provider: "Razorpay",
    setUp: null,
    ended: null,
    limitLow: {
        limit: "1500.00",
        amount: "1800.00",
        currency: "INR",
        at: "2026-09-28T06:00:00.000Z",
    },
    emailTo: "meera@example.in",
};

const panel = (over: Partial<AutopayPanel> = {}): AutopayPanel => ({
    line: "Autopay · UPI",
    detail: null,
    notice: {
        text: "Autopay limit too low — covers up to ₹1,500, this renewal is ₹1,800",
        tone: "warn",
    },
    sendLabel: "Send a set-up link",
    canCancel: true,
    ...over,
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

function render(p: AutopayPanel, openSend: boolean) {
    act(() => {
        root.render(
            <AutopayActions
                subscriptionId="sub_1"
                panel={p}
                card={card}
                firstName="Meera"
                timeZone="Asia/Kolkata"
                now={new Date("2026-09-29T06:00:00.000Z")}
                openSend={openSend}
            />,
        );
    });
}

const dialog = () => document.querySelector('[role="dialog"]');

describe("opening the set-up sheet from Home (D14)", () => {
    it("opens Send a set-up link straight away when asked", () => {
        render(panel(), true);
        expect(dialog()?.textContent).toContain("Send a set-up link");
        expect(dialog()?.textContent).toContain(
            "Its limit covers this renewal of ₹1,800",
        );
    });

    it("stays closed when not asked", () => {
        render(panel(), false);
        expect(dialog()).toBeNull();
    });

    it("never opens a sheet this screen doesn't offer", () => {
        render(panel({ sendLabel: null }), true);
        expect(dialog()).toBeNull();
    });
});
