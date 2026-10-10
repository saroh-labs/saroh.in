// @vitest-environment jsdom
/**
 * A part of a page that couldn't be read is said one way (UX audit, 10 Oct
 * 2026): "Couldn't load {things}.", what that leaves unsaid, and Try again,
 * which really reads again. For a read a component made itself, that is the
 * read called again, never a refresh of the route that would not ask for it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/subscriptions/actions", () => ({
    loadSubscriptionEvents: vi.fn(),
}));

import { LeavesStep } from "@/components/commerce/new-order/leaves-step";
import { PanelLine } from "@/components/commerce/product-page/overview-parts";
import { ChangesCard } from "@/components/subscriptions/subscription-detail/changes-card";
import type {
    Optional,
    SubscriptionEventsPage,
} from "@/lib/subscriptions/service";

import { FailedRead, PartialRead } from "./failed-read";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    refresh.mockClear();
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

const draw = (node: React.ReactNode) => act(() => root.render(node));
const tryAgain = (): HTMLButtonElement | undefined =>
    Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent === "Try again",
    );
const press = (button: HTMLButtonElement | undefined) =>
    act(() => {
        button?.click();
    });

describe("PartialRead, above a page whose rest arrived", () => {
    it("says what is missing in the one sentence, then what that leaves unsaid", () => {
        draw(
            <PartialRead
                things="reviews"
                so="Their count shows as “—”. It is not zero."
            />,
        );
        const notice = host.querySelector('[role="status"]');
        expect(notice?.textContent).toContain(
            "Couldn't load reviews. Their count shows as “—”. It is not zero.",
        );
        // Something unknown, not something broken: never an alert.
        expect(host.querySelector('[role="alert"]')).toBe(null);
    });

    it("offers Try again, which reads the page's reads again", () => {
        draw(<PartialRead things="bookings" />);
        expect(host.textContent).toContain("Couldn't load bookings.");
        press(tryAgain());
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("calls a component's own read again, and leaves the route alone", () => {
        const again = vi.fn();
        draw(<PartialRead things="the preview" onRetry={again} />);
        press(tryAgain());
        expect(again).toHaveBeenCalledTimes(1);
        expect(refresh).not.toHaveBeenCalled();
    });
});

describe("FailedRead, for a part that is absent", () => {
    it("is one line: what, the reassurance, Try again", () => {
        draw(
            <FailedRead
                things="the stock log"
                reassurance="The numbers above are still right."
            />,
        );
        const line = host.querySelector('[role="alert"]');
        expect(line?.getAttribute("data-state")).toBe("failed");
        expect(line?.textContent).toContain(
            "Couldn't load the stock log. The numbers above are still right.",
        );
        press(tryAgain());
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("calls a component's own read again", () => {
        const again = vi.fn();
        draw(<FailedRead things="your photos" onRetry={again} />);
        press(tryAgain());
        expect(again).toHaveBeenCalledTimes(1);
        expect(refresh).not.toHaveBeenCalled();
    });
});

describe("call sites", () => {
    it("a product's panel that didn't arrive offers Try again", () => {
        draw(<PanelLine status="failed" what="orders" />);
        expect(host.textContent).toContain(
            "Couldn't load orders. Everything else on this page is current.",
        );
        press(tryAgain());
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("a panel the role can't see is a note, with nothing to try", () => {
        draw(<PanelLine status="forbidden" what="orders" />);
        expect(host.textContent).toBe("Your role can't see orders.");
        expect(tryAgain()).toBeUndefined();
    });

    it("New order's ways that couldn't be read are asked for again, as they are", () => {
        const again = vi.fn();
        draw(
            <LeavesStep
                ways={[]}
                way={null}
                onWay={() => undefined}
                address={{ line1: "", city: "", state: "", postalCode: "" }}
                onAddress={() => undefined}
                format={(cents) => String(cents)}
                failed
                onRetry={again}
                loading={false}
            />,
        );
        expect(host.textContent).toContain(
            "Couldn't load how these items can leave.",
        );
        press(tryAgain());
        expect(again).toHaveBeenCalledTimes(1);
        expect(refresh).not.toHaveBeenCalled();
    });

    describe("a subscription's Changes", () => {
        const sub = {
            id: "sub_1",
            timezone: "Asia/Kolkata",
            contact: { id: "c_1", name: "Asha Rao" },
        } as Parameters<typeof ChangesCard>[0]["sub"];
        const card = (page: Optional<SubscriptionEventsPage>) => (
            <ChangesCard
                page={page}
                sub={sub}
                viewerId={null}
                now={new Date("2026-10-10T10:00:00Z")}
            />
        );
        const arrived: Optional<SubscriptionEventsPage> = {
            state: "ok",
            data: {
                events: [
                    {
                        id: "ev_1",
                        kind: "PAUSED",
                        actor: { kind: "TEAM", userId: "u_1", name: "Meera" },
                        invoice: null,
                        note: null,
                        data: {},
                        createdAt: "2026-10-09T10:00:00Z",
                    },
                ],
                nextCursor: null,
                earlierUnrecorded: false,
            },
        };

        it("that couldn't be read say so, and Try again reads the page again", () => {
            draw(card({ state: "failed" }));
            expect(host.textContent).toContain(
                "Couldn't load the changes. Everything else on this page is up to date.",
            );
            press(tryAgain());
            expect(refresh).toHaveBeenCalledTimes(1);
        });

        it("that then arrive are drawn, not an empty card", () => {
            draw(card({ state: "failed" }));
            draw(card(arrived));
            expect(host.textContent).not.toContain("Couldn't load");
            expect(host.textContent).toContain("Meera");
        });

        it("a role that can't see them reads a note, with nothing to try", () => {
            draw(card({ state: "denied" }));
            expect(host.querySelector('[role="note"]')?.textContent).toBe(
                "Your role can't see what changed on this subscription.",
            );
            expect(tryAgain()).toBeUndefined();
        });
    });
});

describe("no page words a failed read of its own", () => {
    const APP = join(__dirname, "..", "..");

    function sources(dir: string): string[] {
        return readdirSync(dir).flatMap((name) => {
            const path = join(dir, name);
            if (statSync(path).isDirectory()) return sources(path);
            return name.endsWith(".tsx") && !name.includes(".test.")
                ? [path]
                : [];
        });
    }

    /**
     * The old grammars, as they were written into a page. A sentence that
     * isn't a failed read of a part of the page is listed with why.
     */
    const OLD =
        /(couldn(?:'|&apos;)t|could not) be (?:read|loaded|counted)(?: just now)?[,.]/i;
    const KEPT: Record<string, string> = {
        // A stored copy that can no longer be read: nothing to try again.
        "app/(shell)/sites/[siteId]/versions/[publicationId]/page.tsx":
            "stored copy",
    };

    it("in the words a screen used to choose for itself", () => {
        const found = [
            ...sources(join(APP, "app")),
            ...sources(join(APP, "components")),
        ]
            .map((path) => relative(APP, path))
            .filter((file) => !(file in KEPT))
            .flatMap((file) =>
                readFileSync(join(APP, file), "utf8")
                    .split("\n")
                    // Comments explain; only what is drawn counts.
                    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
                    // A toast or a result's sentence is its own rule.
                    .filter((line) => !/showError\(|\berror:/.test(line))
                    .filter((line) => OLD.test(line))
                    .map((line) => `${file}: ${line.trim()}`),
            );
        expect(found).toEqual([]);
    });
});
