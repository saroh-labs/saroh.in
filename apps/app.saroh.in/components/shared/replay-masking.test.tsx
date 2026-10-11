// @vitest-environment jsdom
/**
 * What a session recording of the workspace can read (DEC-125, 10 Oct):
 * Saroh's own words, and nothing of a business's or its customers'.
 *
 * A fixture screen is drawn with the real shared components (the rail, a
 * page header, a form, a table, a button), and every text node is put
 * through the recorder's own text function with the element it sits in,
 * exactly as posthog-js calls it (`maskTextFn(text, parentElement)` under
 * `maskTextSelector: "*"`). What comes back is what a recording holds.
 */
import {
    maskWorkspaceAttribute,
    maskWorkspaceText,
    replayConfig,
} from "@saroh/error-tracking/browser";
import { Avatar, AvatarFallback } from "@saroh/ui/avatar";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { PageHeader } from "@saroh/ui/page-header";
import { StatCard } from "@saroh/ui/stat-card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@saroh/ui/table";
import type { AnchorHTMLAttributes } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "./app-sidebar";
import { UsageNotice } from "./usage-notice";

vi.mock("next/navigation", () => ({
    usePathname: () => "/customers",
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
vi.mock("@/lib/usage-sharing/actions", () => ({
    dismissUsageNotice: vi.fn(() => Promise.resolve({ ok: true, data: {} })),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    // The rail asks how wide the window is.
    vi.stubGlobal(
        "matchMedia",
        () =>
            ({
                matches: false,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            }) as unknown as MediaQueryList,
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
});

/** A customer's page, with the rail beside it. */
function Fixture() {
    const customer = { name: "Asha Rao", email: "asha@example.com" };
    return (
        <div>
            <AppSidebar />
            <main>
                <UsageNotice />
                {/* A detail page: the title is the record's own name. */}
                <PageHeader
                    holdsData
                    title={customer.name}
                    description={customer.email}
                />
                {/* A list page: the title is Saroh's word for the screen. */}
                <PageHeader
                    title="Customers"
                    description="Everyone who has bought, booked or enquired."
                    actions={<Button>New customer</Button>}
                />
                <StatCard label="Paid this month" value="₹48,200" />
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>Spent</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow>
                            <TableCell>
                                <Avatar>
                                    <AvatarFallback>AR</AvatarFallback>
                                </Avatar>
                                Meera Nair
                                {/* A button inside a row is the row's. */}
                                <Button>Open Meera</Button>
                            </TableCell>
                            <TableCell>₹1,250.00</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
                <form>
                    <Label htmlFor="note">Note for the team</Label>
                    <Input
                        id="note"
                        defaultValue="Prefers evening visits"
                        placeholder="Add a note"
                    />
                    {/* A label that names a record says so itself. */}
                    <Button data-ph-mask="">Link to Kiran Shah</Button>
                    <Button>Take ₹650</Button>
                </form>
                <EmptyState
                    title="No bookings yet"
                    description="A booking shows here once someone books."
                />
                {/* Unmarked text: masked, whatever it says. */}
                <p>Last seen at 14 Hill Road, Bandra</p>
            </main>
        </div>
    );
}

/** The page as a recording holds it: each text node after the recorder's function. */
function recorded(): string[] {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, 4 /* text */);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? "";
        if (!text.trim()) continue;
        out.push(maskWorkspaceText(text, node.parentElement).trim());
    }
    return out;
}

describe("a recording of a workspace screen", () => {
    beforeEach(() => {
        act(() => root.render(<Fixture />));
    });

    it("reads the navigation and Saroh's own fixed words", () => {
        const page = recorded();
        // The rail.
        expect(page).toContain("Home");
        expect(page).toContain("Customers");
        // A button, a fixed page title and its description, a column's
        // name, a field's label, an empty state.
        expect(page).toContain("New customer");
        expect(page).toContain("Everyone who has bought, booked or enquired.");
        expect(page).toContain("Spent");
        expect(page).toContain("Note for the team");
        expect(page).toContain("No bookings yet");
        expect(page).toContain("A booking shows here once someone books.");
    });

    it("reads the notice that says it is being recorded", () => {
        expect(recorded().join(" ")).toContain(
            "We record how the workspace is used to make Saroh easier.",
        );
    });

    it("never holds a customer's name, an amount, an address or a figure", () => {
        const all = recorded().join("\n");
        for (const secret of [
            "Asha",
            "Rao",
            "asha@example.com",
            "Meera",
            "Nair",
            "AR",
            "Kiran",
            "Shah",
            "1,250",
            "48,200",
            "650",
            "Hill Road",
            "Bandra",
            "Prefers evening visits",
        ])
            expect(all, secret).not.toContain(secret);
    });

    it("masks a table cell's name and amount, and a button inside the row", () => {
        const page = recorded();
        expect(page).toContain("***** ****"); // Meera Nair
        expect(page).toContain("*********"); // ₹1,250.00, symbol and all
        expect(page).toContain("**** *****"); // Open Meera
        expect(page).not.toContain("Open Meera");
    });

    it("masks a page title that is a record's name, and keeps a fixed one", () => {
        const titles = Array.from(document.querySelectorAll("h1")).map((h1) =>
            maskWorkspaceText(h1.textContent, h1),
        );
        expect(titles).toEqual(["**** ***", "Customers"]);
    });

    it("a masked mark wins inside a readable component", () => {
        expect(recorded()).toContain("**** ** ***** ****"); // Link to Kiran Shah
    });

    it("hides digits even in a readable button", () => {
        expect(recorded()).toContain("Take ₹***");
    });

    it("masks every input: the recorder's own rule, and no text node holds a value", () => {
        const recording = replayConfig("https://eu.i.posthog.com", "user_1")
            .session_recording as Record<string, unknown>;
        expect(recording.maskAllInputs).toBe(true);
        expect(recording.maskTextSelector).toBe("*");
        expect(recording.maskTextFn).toBe(maskWorkspaceText);
        const input = document.querySelector("input");
        expect(input?.value).toBe("Prefers evening visits");
        // Its placeholder is an attribute: masked by the attribute rule.
        expect(
            maskWorkspaceAttribute(
                "placeholder",
                input?.getAttribute("placeholder") ?? "",
                input,
            ),
        ).toBe("*** * ****");
    });

    it("the shared components carry the marks themselves", () => {
        const marked = (selector: string) =>
            document.querySelector(selector)?.outerHTML.slice(0, 200) ?? "";
        expect(marked("aside[aria-label='Workspace']")).toContain(
            "data-ph-unmask",
        );
        expect(marked("th")).toContain("data-ph-unmask");
        expect(marked("td")).toContain("data-ph-mask");
        expect(marked("label")).toContain("data-ph-unmask");
        expect(marked("[data-testid='usage-notice']")).toContain(
            "data-ph-unmask",
        );
    });
});
