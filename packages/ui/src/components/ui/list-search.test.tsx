import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ListSearch, SEARCH_DEBOUNCE_MS } from "./list-search";

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

const field = () => screen.getByRole("searchbox");
const noop = () => undefined;

describe("ListSearch", () => {
    it("is named by its placeholder, which the caller must give", () => {
        render(<ListSearch placeholder="Search orders" onSearch={noop} />);
        expect(
            screen.getByRole("searchbox", { name: "Search orders" }),
        ).toHaveAttribute("placeholder", "Search orders");
    });

    it("tells the list only once typing has paused for 180ms", () => {
        const onSearch = vi.fn();
        render(<ListSearch placeholder="Search orders" onSearch={onSearch} />);
        fireEvent.change(field(), { target: { value: "a" } });
        fireEvent.change(field(), { target: { value: "an" } });
        act(() => {
            vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
        });
        expect(onSearch).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(onSearch).toHaveBeenCalledTimes(1);
        expect(onSearch).toHaveBeenCalledWith("an");
        expect(SEARCH_DEBOUNCE_MS).toBe(180);
    });

    it("settles at once on Enter and on leaving the field", () => {
        const onSearch = vi.fn();
        render(<ListSearch placeholder="Search orders" onSearch={onSearch} />);
        fireEvent.change(field(), { target: { value: "tea" } });
        fireEvent.keyDown(field(), { key: "Enter" });
        expect(onSearch).toHaveBeenLastCalledWith("tea");
        fireEvent.change(field(), { target: { value: "teap" } });
        fireEvent.blur(field());
        expect(onSearch).toHaveBeenLastCalledWith("teap");
    });

    it("Escape clears the field and tells the list at once", () => {
        const onSearch = vi.fn();
        render(
            <ListSearch
                placeholder="Search orders"
                defaultValue="tea"
                onSearch={onSearch}
            />,
        );
        expect(field()).toHaveValue("tea");
        fireEvent.keyDown(field(), { key: "Escape" });
        expect(field()).toHaveValue("");
        expect(onSearch).toHaveBeenCalledWith("");
        // Nothing left over from the timer.
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(onSearch).toHaveBeenCalledTimes(1);
    });

    it("Escape on an empty field is left for whatever is behind it", () => {
        const onSearch = vi.fn();
        const onKeyDown = vi.fn();
        render(
            <div onKeyDown={onKeyDown}>
                <ListSearch placeholder="Search orders" onSearch={onSearch} />
            </div>,
        );
        fireEvent.keyDown(field(), { key: "Escape" });
        expect(onSearch).not.toHaveBeenCalled();
        expect(onKeyDown).toHaveBeenCalled();
    });

    it("follows the address when it changes from outside, but never over typing", () => {
        const { rerender } = render(
            <ListSearch
                placeholder="Search orders"
                defaultValue="tea"
                onSearch={noop}
            />,
        );
        rerender(
            <ListSearch
                placeholder="Search orders"
                defaultValue=""
                onSearch={noop}
            />,
        );
        expect(field()).toHaveValue("");

        field().focus();
        fireEvent.change(field(), { target: { value: "cof" } });
        rerender(
            <ListSearch
                placeholder="Search orders"
                defaultValue="co"
                onSearch={noop}
            />,
        );
        expect(field()).toHaveValue("cof");
    });

    it("trims the term it hands over", () => {
        const onSearch = vi.fn();
        render(<ListSearch placeholder="Search orders" onSearch={onSearch} />);
        fireEvent.change(field(), { target: { value: "  tea " } });
        fireEvent.keyDown(field(), { key: "Enter" });
        expect(onSearch).toHaveBeenLastCalledWith("tea");
    });

    it('"/" focuses it from anywhere but another field', () => {
        render(
            <>
                <ListSearch placeholder="Search orders" onSearch={noop} />
                <input aria-label="Other" />
                <button type="button">Elsewhere</button>
            </>,
        );
        screen.getByRole("button", { name: "Elsewhere" }).focus();
        fireEvent.keyDown(screen.getByRole("button", { name: "Elsewhere" }), {
            key: "/",
        });
        expect(document.activeElement).toBe(field());

        const other = screen.getByRole("textbox", { name: "Other" });
        other.focus();
        fireEvent.keyDown(other, { key: "/" });
        expect(document.activeElement).toBe(other);
        expect(field()).toHaveAttribute("aria-keyshortcuts", "/");
    });

    it('"/" does nothing while a dialog is open, or with the shortcut off', () => {
        const { rerender } = render(
            <>
                <ListSearch placeholder="Search orders" onSearch={noop} />
                <div role="dialog" aria-label="Refund">
                    <button type="button">In the dialog</button>
                </div>
            </>,
        );
        const inside = screen.getByRole("button", { name: "In the dialog" });
        inside.focus();
        fireEvent.keyDown(inside, { key: "/" });
        expect(document.activeElement).toBe(inside);

        rerender(
            <>
                <ListSearch
                    placeholder="Search orders"
                    shortcut={false}
                    onSearch={noop}
                />
                <button type="button">Elsewhere</button>
            </>,
        );
        const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
        elsewhere.focus();
        fireEvent.keyDown(elsewhere, { key: "/" });
        expect(document.activeElement).toBe(elsewhere);
    });

    it("says it is searching, to the eye and to a screen reader", () => {
        const { rerender } = render(
            <ListSearch placeholder="Search orders" onSearch={noop} />,
        );
        expect(screen.queryByRole("status")).toBeNull();
        rerender(
            <ListSearch
                placeholder="Search orders"
                searching
                onSearch={noop}
            />,
        );
        // Nothing typed: the list is being read for another reason.
        expect(screen.queryByRole("status")).toBeNull();
        fireEvent.change(field(), { target: { value: "tea" } });
        expect(screen.getByRole("status")).toHaveTextContent("Searching…");
    });

    it("has an icon, one height, 44px and 16px type on touch, the full width on a phone", () => {
        const { container } = render(
            <ListSearch placeholder="Search orders" onSearch={noop} />,
        );
        expect(container.querySelector("svg[aria-hidden]")).not.toBeNull();
        const c = field().className.split(/\s+/);
        expect(c).toContain("h-[38px]");
        expect(c).toContain("coarse:h-11");
        expect(c).toContain("coarse:text-base");
        const box = container.querySelector("[data-list-search]");
        expect(box?.className.split(/\s+/)).toContain("w-full");
    });
});
