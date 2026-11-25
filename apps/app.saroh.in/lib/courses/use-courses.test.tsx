// @vitest-environment jsdom
/**
 * Courses on React Query (DEC-259), in the browser: a course's page reads
 * it once on first load (nothing comes with the page's HTML); a save that
 * landed reads that course once and nothing else that isn't on screen,
 * marking the list, a person's seats, customers, bookings, invoices and
 * Home stale for their next visit. On a person's page, an enrolment reads
 * their seats and their record once each.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    contactCoursesRead,
    courseRead,
    coursesListRead,
} from "@/lib/courses/queries";
import type { CourseSave } from "@/lib/courses/use-courses";
import {
    useContactCourses,
    useCourse,
    useCourseSave,
} from "@/lib/courses/use-courses";
import { customerRead } from "@/lib/customers/queries";
import { useCustomer } from "@/lib/customers/use-customers";
import { domainKey } from "@/lib/query/keys";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";

const ORG = "org_1";
const SEEN = [
    coursesListRead.options(ORG, {}).queryKey,
    contactCoursesRead.options(ORG, { contactId: "c1" }).queryKey,
    customerRead.options(ORG, { customerId: "c1" }).queryKey,
    domainKey("bookings", ORG, "all", {}),
    domainKey("invoices", ORG, "list", {}),
    domainKey("home", ORG, "home"),
];

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));
const urls = () => fetchMock.mock.calls.map(([url]) => url as string);

beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response("{}", { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function CoursePage({ report }: { report: (save: CourseSave) => void }) {
    useCourse({ courseId: "crs_1" });
    report(useCourseSave());
    return null;
}

function PersonPage({ report }: { report: (save: CourseSave) => void }) {
    useCustomer({ customerId: "c1" });
    useContactCourses({ contactId: "c1" });
    report(useCourseSave());
    return null;
}

describe("a course's page", () => {
    it("reads it once, in the browser", async () => {
        const { unmount } = renderWithQuery(
            <CoursePage report={() => undefined} />,
            { orgId: ORG },
        );
        await tick();
        expect(urls()).toEqual(["/api/courses/crs_1"]);
        unmount();
    });

    it("a save reads the course once, nothing else, and marks the rest stale", async () => {
        let save: CourseSave | undefined;
        const client = makeTestClient();
        client.setQueryData(
            courseRead.options(ORG, { courseId: "crs_1" }).queryKey,
            {} as never,
        );
        for (const key of SEEN) client.setQueryData(key, {});
        const { unmount } = renderWithQuery(
            <CoursePage report={(s) => (save = s)} />,
            { client, orgId: ORG },
        );
        await tick();
        // Mounted over what was already read: no read of its own.
        expect(fetchMock).not.toHaveBeenCalled();
        expect(save?.orgId).toBe(ORG);

        await act(() => save?.saved());
        expect(urls()).toEqual(["/api/courses/crs_1"]);
        for (const key of SEEN) {
            expect(
                client.getQueryCache().find({ queryKey: key })?.isStale(),
            ).toBe(true);
        }
        unmount();
    });
});

describe("an enrolment on a person's page", () => {
    it("reads their seats and their record once each", async () => {
        let save: CourseSave | undefined;
        const client = makeTestClient();
        for (const key of SEEN) client.setQueryData(key, {});
        const { unmount } = renderWithQuery(
            <PersonPage report={(s) => (save = s)} />,
            { client, orgId: ORG },
        );
        await tick();
        expect(fetchMock).not.toHaveBeenCalled();

        await act(() => save?.saved());
        expect(urls().sort()).toEqual([
            "/api/courses/contact/c1",
            "/api/customers/c1",
        ]);
        unmount();
    });
});
