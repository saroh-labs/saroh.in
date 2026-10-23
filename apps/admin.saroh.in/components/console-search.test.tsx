/** @vitest-environment jsdom */
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConsoleSearch as Answer } from "@/lib/search-words";

import { ConsoleSearch } from "./console-search";

/**
 * The header search (admin console redesign U10, R15): a combobox. It says
 * "Searching…", arrows move, Enter opens, Esc closes, "Nothing found" says
 * why when the API says, and it takes no "/" shortcut.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));
// The real action imports the server-only control plane.
vi.mock("@/lib/search-actions", () => ({ searchConsoleAction: vi.fn() }));

const FOUND: Answer = {
    results: [
        {
            kind: "subscription",
            id: "sub-row-1",
            organizationId: "org_1",
            organizationName: "Kavi Dental Clinic",
        },
        {
            kind: "business",
            id: "org_1",
            name: "Kavi Dental Clinic",
            slug: "kavidental",
        },
        { kind: "user", id: "user_1", name: null, email: "asha@example.com" },
    ],
    note: null,
};

function setup(answer: Answer | "fail" = FOUND) {
    const search = vi.fn(() =>
        Promise.resolve(
            answer === "fail"
                ? ({ ok: false } as const)
                : ({ ok: true, data: answer } as const),
        ),
    );
    render(<ConsoleSearch search={search} />);
    const box = screen.getByRole("combobox", { name: "Search the console" });
    return { search, box };
}

function type(box: HTMLElement, value: string) {
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value } });
}

beforeEach(() => push.mockReset());
afterEach(cleanup);

describe("the header search", () => {
    it("says Searching…, then lists what it found", async () => {
        const { search, box } = setup();
        type(box, "sub_RxY123abc");

        expect(screen.getByRole("status").textContent).toBe("Searching…");
        await waitFor(() =>
            expect(screen.getAllByRole("option")).toHaveLength(3),
        );
        expect(search).toHaveBeenCalledWith("sub_RxY123abc");
        expect(screen.getByRole("status").textContent).toBe("");
        // A user with no name is their email.
        expect(screen.getAllByRole("option")[2]?.textContent).toContain(
            "asha@example.com",
        );
    });

    it("moves with the arrows and opens the marked row with Enter", async () => {
        const { box } = setup();
        type(box, "sub_RxY123abc");
        await waitFor(() =>
            expect(screen.getAllByRole("option")).toHaveLength(3),
        );

        const options = () => screen.getAllByRole("option");
        // The first answer is marked when they arrive.
        expect(options()[0]?.getAttribute("aria-selected")).toBe("true");
        expect(box.getAttribute("aria-activedescendant")).toBe(
            options()[0]?.id,
        );

        fireEvent.keyDown(box, { key: "ArrowDown" });
        expect(options()[1]?.getAttribute("aria-selected")).toBe("true");
        fireEvent.keyDown(box, { key: "ArrowUp" });
        fireEvent.keyDown(box, { key: "ArrowUp" });
        // Up from the first wraps to the last.
        expect(options()[2]?.getAttribute("aria-selected")).toBe("true");
        fireEvent.keyDown(box, { key: "ArrowDown" });

        fireEvent.keyDown(box, { key: "Enter" });
        expect(push).toHaveBeenCalledWith(
            "/billing/subscriptions?q=sub_RxY123abc&open=sub-row-1",
        );
        expect((box as HTMLInputElement).value).toBe("");
    });

    it("opens a business and a user at their own pages", async () => {
        const { box } = setup();
        type(box, "kavi");
        await waitFor(() =>
            expect(screen.getAllByRole("option")).toHaveLength(3),
        );

        fireEvent.click(screen.getAllByRole("option")[1]);
        expect(push).toHaveBeenLastCalledWith("/businesses/org_1");

        type(box, "asha");
        await waitFor(() =>
            expect(screen.getAllByRole("option")).toHaveLength(3),
        );
        fireEvent.click(screen.getAllByRole("option")[2]);
        expect(push).toHaveBeenLastCalledWith("/users/user_1");
    });

    it("closes with Esc, and a second Esc clears the box", async () => {
        const { box } = setup();
        type(box, "kavi");
        await waitFor(() =>
            expect(box.getAttribute("aria-expanded")).toBe("true"),
        );

        fireEvent.keyDown(box, { key: "Escape" });
        expect(box.getAttribute("aria-expanded")).toBe("false");
        expect(screen.queryByRole("listbox")).toBeNull();
        expect((box as HTMLInputElement).value).toBe("kavi");

        fireEvent.keyDown(box, { key: "Escape" });
        expect((box as HTMLInputElement).value).toBe("");
    });

    it("says Nothing found, and why when the API says", async () => {
        const { box } = setup({ results: [], note: "email-needs-pii" });
        type(box, "asha@example.com");

        await waitFor(() =>
            expect(screen.getByRole("status").textContent).toContain(
                "Nothing found",
            ),
        );
        expect(screen.getByRole("status").textContent).toContain(
            "Finding someone by email needs access to personal data.",
        );
        expect(screen.queryAllByRole("option")).toHaveLength(0);
        fireEvent.keyDown(box, { key: "Enter" });
        expect(push).not.toHaveBeenCalled();
    });

    it("says when a search didn't finish", async () => {
        const { box } = setup("fail");
        type(box, "kavi");
        await waitFor(() =>
            expect(screen.getByRole("status").textContent).toBe(
                "Search didn't finish. Try again.",
            ),
        );
    });

    it("searches nothing under two characters", async () => {
        const { search, box } = setup();
        type(box, "k");
        expect(box.getAttribute("aria-expanded")).toBe("false");
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(search).not.toHaveBeenCalled();
    });

    it("takes no / shortcut, and ⌘K comes to it", () => {
        const { box } = setup();
        fireEvent.keyDown(window, { key: "/" });
        expect(document.activeElement).not.toBe(box);

        fireEvent.keyDown(window, { key: "k", metaKey: true });
        expect(document.activeElement).toBe(box);
    });
});
