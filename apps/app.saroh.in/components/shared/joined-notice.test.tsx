// @vitest-environment jsdom
/**
 * The one-time line a new team member is met with (UX audit, 10 Oct): shown
 * once from the cookie the door left, and never again.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    encodeJoined,
    JOINED_COOKIE,
    joinedLine,
} from "@/lib/organizations/joined";

import { JoinedNotice } from "./joined-notice";

let root: Root;
let host: HTMLDivElement;

const LINE = joinedLine({ name: "Rye & Co.", role: "REVIEWER" });

function mount() {
    root = createRoot(host);
    act(() => root.render(<JoinedNotice />));
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    document.cookie = `${JOINED_COOKIE}=; Max-Age=0; path=/`;
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const notice = () => host.querySelector("[data-joined-notice]");

describe("JoinedNotice", () => {
    it("draws nothing on an ordinary visit", () => {
        mount();
        expect(notice()).toBeNull();
    });

    it("says which business they joined, as what, and what that opens", () => {
        document.cookie = `${JOINED_COOKIE}=${encodeJoined(LINE)}; path=/`;
        mount();
        expect(notice()?.textContent).toContain(
            "You've joined Rye & Co. as Reviewer. You can read and comment on the pages you were asked to look at.",
        );
        // Announced, not shouted.
        expect(notice()?.getAttribute("role")).toBe("status");
    });

    it("is said once: the cookie is gone, and a reload says nothing", () => {
        document.cookie = `${JOINED_COOKIE}=${encodeJoined(LINE)}; path=/`;
        mount();
        expect(notice()).not.toBeNull();
        expect(document.cookie).not.toContain(JOINED_COOKIE);
        act(() => root.unmount());
        mount();
        expect(notice()).toBeNull();
    });

    it("goes when dismissed", () => {
        document.cookie = `${JOINED_COOKIE}=${encodeJoined(LINE)}; path=/`;
        mount();
        const button = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent === "Got it",
        );
        act(() => button?.click());
        expect(notice()).toBeNull();
    });

    it("never shows a cookie that is not one of its lines", () => {
        document.cookie = `${JOINED_COOKIE}=${encodeURIComponent("<b>Pay here</b>")}; path=/`;
        mount();
        expect(notice()).toBeNull();
        // And still clears it.
        expect(document.cookie).not.toContain(JOINED_COOKIE);
    });
});
