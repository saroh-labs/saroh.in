// @vitest-environment jsdom
/**
 * A course's sessions, read first: the list shows with nothing open, and
 * "Add session" by the heading opens a dialog with the date and time. A
 * refusal keeps it open with what was chosen; a session added closes it.
 * With no sessions yet the empty line carries the button.
 *
 * `react-dom/client` + `act` directly, as the other component tests do. The
 * dialog's parts and the pickers are drawn in place: a portal and the
 * calendar popover are not what is tested here.
 */
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CourseDetail } from "@/lib/courses/service";

import { CoursePage } from "./course-page";

const addSession = vi.fn();
vi.mock("@/lib/courses/actions", () => ({
    addSession: (...a: unknown[]) => addSession(...a) as unknown,
    cancelEnrollment: vi.fn(),
    removeSession: vi.fn(),
    updateCourse: vi.fn(),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh }),
}));
const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...a: unknown[]) => showSuccess(...a) as unknown,
    showError: (...a: unknown[]) => showError(...a) as unknown,
}));
vi.mock("./enrol-dialog", () => ({ EnrolDialog: () => null }));
vi.mock("@saroh/ui/dialog", () => {
    const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
    return {
        Dialog: ({
            open,
            children,
        }: {
            open: boolean;
            children?: ReactNode;
        }) => (open ? <div role="dialog">{children}</div> : null),
        DialogContent: Pass,
        DialogHeader: Pass,
        DialogTitle: ({ children }: { children?: ReactNode }) => (
            <h2 data-title="">{children}</h2>
        ),
        DialogDescription: ({ children }: { children?: ReactNode }) => (
            <p data-description="">{children}</p>
        ),
        DialogFooter: Pass,
    };
});
vi.mock("@saroh/ui/date-picker", () => ({
    DatePicker: ({ id, value }: { id: string; value?: Date }) => (
        <output id={id} data-day="">
            {value ? value.toISOString().slice(0, 10) : ""}
        </output>
    ),
}));
vi.mock("@saroh/ui/time-select", () => ({
    TimeSelect: ({
        id,
        value,
        onValueChange,
    }: {
        id: string;
        value: string;
        onValueChange: (v: string) => void;
    }) => (
        <input
            id={id}
            data-time=""
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
        />
    ),
}));

const NOW = "2026-10-10T06:00:00.000Z";

function courseOf(over: Partial<CourseDetail> = {}): CourseDetail {
    return {
        id: "course_1",
        service: {
            id: "svc_1",
            name: "Pottery",
            capacity: 8,
            durationMinutes: 90,
            timezone: "Asia/Kolkata",
        },
        name: "Wheel throwing",
        description: null,
        price: "4800.00",
        currency: "INR",
        seats: 8,
        enrolled: 0,
        seatsLeft: 8,
        status: "DRAFT",
        sessions: [
            {
                id: "s1",
                // Wednesday 14 Oct 2026, 18:30 in Kolkata.
                startAt: "2026-10-14T13:00:00.000Z",
                endAt: "2026-10-14T14:30:00.000Z",
                booked: 0,
            },
        ],
        sessionsLeft: 1,
        nextSessionAt: "2026-10-14T13:00:00.000Z",
        createdAt: NOW,
        updatedAt: NOW,
        enrollments: [],
        invoicesOnEnrol: false,
        ...over,
    };
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const m of [addSession, refresh, showSuccess, showError])
        m.mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

function render(course: CourseDetail, canWrite = true) {
    act(() =>
        root.render(
            <CoursePage
                course={course}
                contacts={[]}
                canWrite={canWrite}
                now={NOW}
            />,
        ),
    );
}

function buttons(name: string, within: ParentNode = host) {
    return Array.from(within.querySelectorAll("button")).filter(
        (b) => b.textContent.trim() === name,
    );
}

const dialog = () => host.querySelector<HTMLElement>('[role="dialog"]');

function open() {
    act(() => buttons("Add session")[0]?.click());
    const d = dialog();
    if (!d) throw new Error("No dialog");
    return d;
}

async function press(el: HTMLElement | undefined) {
    if (!el) throw new Error("No button");
    await act(async () => {
        el.click();
        await Promise.resolve();
    });
}

describe("a course's sessions", () => {
    it("lists them with one Add session button and nothing open", () => {
        render(courseOf());
        expect(host.textContent).toContain("Wednesday");
        expect(host.textContent).toContain("Nobody booked");
        expect(buttons("Add session")).toHaveLength(1);
        expect(dialog()).toBe(null);
        // The date and time are asked for in the dialog, not on the page.
        expect(host.querySelector("[data-day]")).toBe(null);
        expect(host.querySelector("[data-time]")).toBe(null);
        expect(host.textContent).not.toContain("New session");
    });

    it("offers nothing to add to someone who can't change the course", () => {
        render(courseOf(), false);
        expect(buttons("Add session")).toHaveLength(0);
    });

    it("offers nothing to add on an archived course", () => {
        render(courseOf({ status: "ARCHIVED" }));
        expect(buttons("Add session")).toHaveLength(0);
    });

    it("says none yet, with the button in the empty line", () => {
        render(courseOf({ sessions: [], sessionsLeft: 0 }));
        expect(host.textContent).toContain("No sessions yet");
        expect(host.textContent).toContain(
            "Add the first one, then the course can open for enrolment.",
        );
        expect(buttons("Add session")).toHaveLength(1);
        expect(dialog()).toBe(null);
    });

    it("says none yet without the button to someone who can't add", () => {
        render(courseOf({ sessions: [], sessionsLeft: 0 }), false);
        expect(host.textContent).toContain(
            "A course can open for enrolment once it has a session.",
        );
        expect(buttons("Add session")).toHaveLength(0);
    });
});

describe("adding a session", () => {
    it("opens a dialog named Add session, a week after the last one", () => {
        render(courseOf());
        const d = open();
        expect(d.querySelector("[data-title]")?.textContent).toBe(
            "Add session",
        );
        expect(d.querySelector("[data-description]")?.textContent).toBe(
            "It goes on the schedule for Pottery. Times are in Asia/Kolkata.",
        );
        expect(d.querySelector("[data-day]")?.textContent).toBe("2026-10-21");
        expect(d.querySelector<HTMLInputElement>("[data-time]")?.value).toBe(
            "18:30",
        );
        expect(d.querySelector("label[for]")?.textContent).toBe("Date");
        expect(buttons("Cancel", d)).toHaveLength(1);
        expect(buttons("Add session", d)).toHaveLength(1);
    });

    it("says who it books when people are on the course", () => {
        render(courseOf({ enrolled: 3, seatsLeft: 5, status: "OPEN" }));
        const d = open();
        expect(d.querySelector("[data-description]")?.textContent).toBe(
            "It goes on the schedule for Pottery, and the 3 people on this course are booked on it. Times are in Asia/Kolkata.",
        );
        expect(buttons("Add and book 3", d)).toHaveLength(1);
    });

    it("can't be added without a date", () => {
        render(courseOf({ sessions: [], sessionsLeft: 0 }));
        const d = open();
        expect(buttons("Add session", d)[0]?.disabled).toBe(true);
    });

    it("stays open with what was chosen when it is refused", async () => {
        addSession.mockResolvedValue({
            ok: false,
            error: "Pottery already has a class then.",
        });
        render(courseOf());
        const d = open();
        await press(buttons("Add session", d)[0]);
        expect(addSession).toHaveBeenCalledTimes(1);
        expect(addSession.mock.calls[0]?.[0]).toBe("course_1");
        expect(showError).toHaveBeenCalledWith(
            "Pottery already has a class then.",
        );
        expect(dialog()).not.toBe(null);
        expect(dialog()?.querySelector("[data-day]")?.textContent).toBe(
            "2026-10-21",
        );
        expect(refresh).not.toHaveBeenCalled();
    });

    it("closes once the session is added, and the list is read again", async () => {
        addSession.mockResolvedValue({ ok: true, data: { id: "s2" } });
        render(courseOf());
        const d = open();
        await press(buttons("Add session", d)[0]);
        expect(showSuccess).toHaveBeenCalledWith("Session added");
        expect(dialog()).toBe(null);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("Cancel closes it and adds nothing", () => {
        render(courseOf());
        const d = open();
        act(() => buttons("Cancel", d)[0]?.click());
        expect(dialog()).toBe(null);
        expect(addSession).not.toHaveBeenCalled();
    });
});
