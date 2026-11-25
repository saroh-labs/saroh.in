// @vitest-environment jsdom
/**
 * Courses' first paint (#1480): before the list's read lands, the real
 * header (title, New course), search and tabs are drawn with the rows'
 * skeleton, never "No courses yet" or a 0; a course's page keeps its
 * loader until the course lands. Neither reads anything but its route.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/courses",
    useSearchParams: () => new URLSearchParams(),
}));

// Server Actions: nothing is saved here.
vi.mock("@/lib/courses/actions", () => ({}));
vi.mock("@/lib/gst-rates/actions", () => ({}));

import { renderWithQuery } from "@/lib/query/test-utils";

import { CourseDetailContainer } from "./course-detail-container";
import { CoursesContainer } from "./courses-container";

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

beforeEach(() => {
    // Never lands: the first paint is what stays.
    fetchMock = vi.fn<typeof fetch>(() => new Promise(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("Courses, before the list lands", () => {
    it("draws the frame and the rows' skeleton, and no rows", async () => {
        const { host, unmount } = renderWithQuery(
            <CoursesContainer canWrite missingRates={null} />,
        );
        await tick();
        expect(host.querySelector("h1")?.textContent).toBe("Courses");
        const links = Array.from(host.querySelectorAll("a"), (a) => a.text);
        expect(links).toContain("New course");
        expect(host.querySelector('input[type="search"]')).not.toBe(null);
        expect(host.querySelector('[data-shape="rows"]')).not.toBe(null);
        expect(host.textContent).not.toContain("No courses yet");
        expect(host.textContent).not.toMatch(/\b0 courses\b/);
        expect(host.querySelector("table tbody tr")).toBe(null);
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            "/api/courses",
        ]);
        unmount();
    });
});

describe("a course's page, before it lands", () => {
    it("keeps the route's loader", async () => {
        const { host, unmount } = renderWithQuery(
            <CourseDetailContainer
                ask={{ courseId: "crs_1" }}
                skeleton={<p data-loader="">Loading the course</p>}
                contacts={[]}
                canWrite
            />,
        );
        await tick();
        expect(host.querySelector("[data-loader]")).not.toBe(null);
        expect(host.querySelector("h1")).toBe(null);
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            "/api/courses/crs_1",
        ]);
        unmount();
    });
});
