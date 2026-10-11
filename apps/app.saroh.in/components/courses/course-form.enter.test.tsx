// @vitest-environment jsdom
/**
 * Enter in the course form runs its primary button: Save and open on a new
 * course, Save on one being changed. Save as draft is a press of its own.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CourseDetail } from "@/lib/courses/service";

import { CourseForm } from "./course-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}));
const actions = vi.hoisted(() => ({
    createCourse: vi.fn(),
    updateCourse: vi.fn(),
}));
vi.mock("@/lib/courses/actions", () => actions);
vi.mock("@saroh/ui/toast", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    showSuccess: vi.fn(),
    showError: vi.fn(),
}));

const SERVICES = [
    {
        id: "svc_1",
        name: "Pottery",
        capacity: 8,
        durationMinutes: 90,
        timezone: "Asia/Kolkata",
        currency: "INR",
    },
];

const COURSE = {
    id: "crs_1",
    name: "Wheel throwing",
    description: "",
    price: "2400",
    currency: "INR",
    seats: 6,
    service: { id: "svc_1", name: "Pottery", capacity: 8 },
} as unknown as CourseDetail;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    push.mockReset();
    actions.createCourse.mockReset().mockResolvedValue({
        ok: true,
        data: { id: "crs_2" },
    });
    actions.updateCourse.mockReset().mockResolvedValue({
        ok: true,
        data: { id: "crs_1" },
    });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

function render(course?: CourseDetail) {
    act(() =>
        root.render(
            <CourseForm
                services={SERVICES}
                course={course}
                defaultCurrency="INR"
            />,
        ),
    );
}

const form = () => {
    const el = host.querySelector("form");
    if (!el) throw new Error("No form");
    return el;
};
const submits = () =>
    Array.from(
        form().querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
    ).map((b) => b.textContent.trim());
function button(name: string): HTMLButtonElement {
    const hit = Array.from(form().querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!hit) throw new Error(`No button ${name}`);
    return hit;
}
function type(name: string, value: string) {
    const input = form().querySelector<HTMLInputElement>(
        `input[name="${name}"]`,
    );
    if (!input) throw new Error(`No field ${name}`);
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}
async function settle() {
    for (let i = 0; i < 6; i++)
        await act(async () => {
            await Promise.resolve();
        });
}

describe("Enter in the course form", () => {
    it("a new course's one submit button is the primary, Save and open", () => {
        render();
        expect(submits()).toEqual(["Save and open"]);
        expect(button("Save as draft").type).toBe("button");
        // It waits for a session, so Enter does nothing until there is one.
        expect(button("Save and open").disabled).toBe(true);
    });

    it("submitting a new course's form, as Enter does, opens it", async () => {
        render();
        type("name", "Wheel throwing");
        type("price", "2400");
        act(() => form().requestSubmit());
        await settle();
        expect(actions.createCourse).toHaveBeenCalledTimes(1);
        expect(actions.createCourse.mock.calls[0]?.[0]).toMatchObject({
            name: "Wheel throwing",
            status: "OPEN",
        });
    });

    it("Save as draft is its own press, and keeps a draft", async () => {
        render();
        type("name", "Wheel throwing");
        type("price", "2400");
        act(() => button("Save as draft").click());
        await settle();
        expect(actions.createCourse.mock.calls[0]?.[0]).toMatchObject({
            status: "DRAFT",
        });
        expect(push).toHaveBeenCalledWith("/courses/crs_2");
    });

    it("on a course being changed, Enter saves it", async () => {
        render(COURSE);
        expect(submits()).toEqual(["Save"]);
        act(() => form().requestSubmit());
        await settle();
        expect(actions.updateCourse).toHaveBeenCalledTimes(1);
        expect(actions.createCourse).not.toHaveBeenCalled();
    });
});
