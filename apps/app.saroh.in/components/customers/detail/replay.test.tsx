// @vitest-environment jsdom
/**
 * The customer page as a session recording holds it (DEC-125; owner, 6 Nov):
 * Saroh's own words readable (the tabs, the breadcrumb's root, a filter's
 * choice, a card's small labels, the "Returning" word by the name), the
 * customer's name, email, phone and rows starred. Every text node goes
 * through the recorder's own function with the element it sits in, as
 * posthog-js calls it.
 */
import { maskWorkspaceText } from "@saroh/error-tracking/browser";
import type { AnchorHTMLAttributes } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BookingsTab } from "./bookings-tab";
import { Header, Tabs } from "./header";

vi.mock("next/navigation", () => ({
    usePathname: () => "/contacts/c1",
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

const NAME = "Priya Raman";
const EMAIL = "priya.raman@example.com";
const now = new Date("2026-11-06T10:00:00Z");

function Page() {
    return (
        <main>
            <Header
                sells={false}
                name={NAME}
                initials="PR"
                tag={{ label: "Returning", tone: "ok" }}
                since="Customer since March at Hill Road"
                email={EMAIL}
                phone="+91 98765 43210"
                canEdit={false}
                onEdit={vi.fn()}
                menu={[]}
                starts={[{ label: "New booking", href: "/bookings/new" }]}
            />
            <Tabs
                tabs={[
                    { key: "over", label: "Overview", count: null },
                    { key: "bk", label: "Bookings", count: 3 },
                ]}
                value="bk"
                onChange={vi.fn()}
            />
            <BookingsTab
                now={now}
                bookings={{
                    upcoming: [],
                    past: [
                        {
                            id: "b1",
                            startAt: "2026-11-01T09:00:00Z",
                            endAt: "2026-11-01T10:00:00Z",
                            timezone: "Asia/Kolkata",
                            service: { id: "s1", name: "Deep tissue massage" },
                            isClass: false,
                            staff: { id: "u1", name: "Anita Shah" },
                            status: "COMPLETED",
                            outcome: "ATTENDED",
                            paidWithPack: false,
                            paidWith: null,
                            packName: null,
                            cancelledLate: false,
                        },
                    ],
                }}
            />
        </main>
    );
}

(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<Page />));
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

/** Each text node as the recorder's text function returns it. */
function recorded(): string[] {
    const out: string[] = [];
    const walker = document.createTreeWalker(host, 4 /* text */);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? "";
        if (!text.trim()) continue;
        out.push(maskWorkspaceText(text, node.parentElement).trim());
    }
    return out;
}

describe("a recording of the customer page", () => {
    it("reads Saroh's own words around the customer", () => {
        const page = recorded();
        // The breadcrumb's root, the tabs, the word by the name.
        expect(page).toContain("Contacts");
        expect(page).toContain("Overview");
        expect(page).toContain("Bookings");
        expect(page).toContain("Returning");
        // The buttons, as before.
        expect(page).toContain("New booking");
        expect(page).toContain("Edit details");
        // A booking's state, from a closed set.
        expect(page).toContain("Came");
        // The filter's chosen word.
        expect(page.some((t) => t.startsWith("Past"))).toBe(true);
        expect(page).toContain(
            "Your role can see this customer but not edit them.",
        );
    });

    it("stars the customer's own data", () => {
        const page = recorded().join("\n");
        for (const data of [
            "Priya",
            "Raman",
            "priya.raman",
            "98765",
            "Hill Road",
            "Deep tissue",
            "Anita",
        ])
            expect(page).not.toContain(data);
        // The name is still there, as stars (spaces kept).
        expect(recorded()).toContain(NAME.replace(/\S/g, "*"));
    });

    it("hides digits even in readable words", () => {
        const tab = host.querySelector('[role="tab"][aria-selected="true"]');
        expect(tab).not.toBeNull();
        expect(maskWorkspaceText("Bookings 3", tab)).toBe("Bookings *");
        expect(maskWorkspaceText(EMAIL, tab)).not.toContain("priya");
    });
});
