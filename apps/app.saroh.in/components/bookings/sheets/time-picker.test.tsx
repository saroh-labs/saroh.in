// @vitest-environment jsdom
/**
 * The one time picker (U3, BKMNewBookingStep4 and Move): the day strip
 * with free counts and Closed, times by part of the day in the business's
 * zone, Anyone free naming who, a closed Sunday with Next free day, a
 * time just taken, loading, and the keyboard.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PickerSlot } from "@/lib/services/time-picker";

import { TimePicker } from "./time-picker";

const listAvailability =
    vi.fn<
        (
            serviceId: string,
            from: string,
            to: string,
            staffId?: string,
        ) => Promise<PickerSlot[]>
    >();
vi.mock("@/lib/services/actions", () => ({
    listAvailability: (...args: Parameters<typeof listAvailability>) =>
        listAvailability(...args),
}));

const ZONE = "Asia/Kolkata";
// Mon 19 Oct 2026, 8:30 am in India.
const NOW = Date.parse("2026-10-19T03:00:00.000Z");
const at = (local: string) => new Date(`${local}:00+05:30`).toISOString();
const slot = (local: string, staffIds: string[]): PickerSlot => ({
    startAt: at(local),
    endAt: at(local),
    staffIds,
});
const PEOPLE = [
    { id: "p_meera", name: "Meera Iyer" },
    { id: "p_arjun", name: "Arjun Rao" },
];

/** Two weeks of Meera and Arjun; Sundays closed. */
function week(staffId?: string, without: string[] = []): PickerSlot[] {
    const all = [
        slot("2026-10-19T12:15", ["p_meera"]),
        slot("2026-10-20T09:00", ["p_meera", "p_arjun"]),
        slot("2026-10-20T10:00", ["p_arjun"]),
        slot("2026-10-20T16:00", ["p_meera"]),
        slot("2026-10-26T09:00", ["p_meera"]),
    ];
    return all.filter(
        (s) =>
            (!staffId || s.staffIds?.includes(staffId)) &&
            !without.includes(s.startAt),
    );
}

let root: Root;
let host: HTMLDivElement;
const onChange = vi.fn();
const onWithChange = vi.fn();

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    listAvailability.mockReset();
    onChange.mockReset();
    onWithChange.mockReset();
    listAvailability.mockImplementation((_s, _f, _t, staffId) =>
        Promise.resolve(week(staffId)),
    );
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

async function draw(props: Partial<Parameters<typeof TimePicker>[0]> = {}) {
    await act(async () => {
        root.render(
            <TimePicker
                serviceId="svc_assess"
                timezone={ZONE}
                value={null}
                onChange={onChange}
                people={PEOPLE}
                withId={null}
                onWithChange={onWithChange}
                closedWeekdays={[0]}
                now={NOW}
                initialDay="2026-10-20"
                {...props}
            />,
        );
        await Promise.resolve();
    });
    await act(async () => {
        await Promise.resolve();
    });
}

const radios = (group: string) => {
    const g = Array.from(host.querySelectorAll('[role="radiogroup"]')).find(
        (el) =>
            document.getElementById(el.getAttribute("aria-labelledby") ?? "")
                ?.textContent === group,
    );
    if (!g) throw new Error(`No group ${group}`);
    return Array.from(g.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
};

function button(text: string | RegExp): HTMLButtonElement {
    const hit = Array.from(host.querySelectorAll("button")).find((b) =>
        typeof text === "string"
            ? b.textContent.trim() === text
            : text.test(b.textContent),
    );
    if (!hit) throw new Error(`No button ${String(text)}`);
    return hit;
}

describe("the time picker", () => {
    it("shows the day strip with free counts, Closed on Sunday, and Pick a date", async () => {
        await draw();
        const days = radios("Day");
        expect(days).toHaveLength(14);
        expect(days[0]?.textContent).toBe("Today191 free");
        expect(days[1]?.textContent).toBe("Tmrw203 free");
        expect(days[6]?.textContent).toBe("Sun25Closed");
        expect(days[1]?.getAttribute("aria-checked")).toBe("true");
        expect(button("Pick a date")).toBeTruthy();
    });

    it("splits the day's times by part of the day, in the business's zone", async () => {
        await draw();
        expect(host.textContent).toContain("Tue 20 Oct");
        expect(host.textContent).toContain("times in IST");
        expect(host.textContent).toContain("Morning");
        expect(host.textContent).toContain("Afternoon and evening");
        const times = radios("Tue 20 Oct").map((b) => b.textContent);
        expect(times).toEqual([
            "9:00 amMeera",
            "10:00 amArjun",
            "4:00 pmMeera",
        ]);
    });

    it("Anyone free names who; picking a time says who takes it", async () => {
        await draw();
        act(() => radios("Tue 20 Oct")[1]?.click());
        expect(onChange).toHaveBeenCalledWith(at("2026-10-20T10:00"), {
            id: "p_arjun",
            name: "Arjun Rao",
        });
    });

    it("reads one person's times when With is them, and says With them", async () => {
        await draw({ withId: "p_meera" });
        expect(listAvailability).toHaveBeenLastCalledWith(
            "svc_assess",
            expect.any(String),
            expect.any(String),
            "p_meera",
        );
        expect(host.textContent).toContain("With Meera Iyer");
        expect(radios("Tue 20 Oct").map((b) => b.textContent)).toEqual([
            "9:00 am",
            "4:00 pm",
        ]);
        act(() => button("Arjun").click());
        expect(onWithChange).toHaveBeenCalledWith("p_arjun");
    });

    it("a closed Sunday says why, and Next free day jumps to Monday", async () => {
        await draw({ initialDay: "2026-10-25" });
        expect(host.textContent).toContain("No free times on Sun 25 Oct");
        expect(host.textContent).toContain("You're closed on Sundays.");
        const why = button("Why isn't a time offered?");
        expect(why.getAttribute("aria-expanded")).toBe("false");
        act(() => why.click());
        expect(why.getAttribute("aria-expanded")).toBe("true");
        expect(host.textContent).toContain("Hours and time off");
        act(() => button("Next free day: Mon 26 Oct").click());
        expect(host.textContent).toContain("Mon 26 Oct");
        expect(radios("Mon 26 Oct").map((b) => b.textContent)).toEqual([
            "9:00 amMeera",
        ]);
    });

    it("a time just taken: says so, reads the times again, and stops offering it", async () => {
        await draw();
        const reads = listAvailability.mock.calls.length;
        listAvailability.mockImplementation((_s, _f, _t, staffId) =>
            Promise.resolve(week(staffId, [at("2026-10-20T10:00")])),
        );
        await draw({ taken: at("2026-10-20T10:00") });
        expect(host.querySelector('[role="alert"]')?.textContent).toContain(
            "10:00 am was just booked by someone else. Pick another time.",
        );
        expect(listAvailability.mock.calls.length).toBeGreaterThan(reads);
        expect(radios("Tue 20 Oct").map((b) => b.textContent)).toEqual([
            "9:00 amMeera",
            "4:00 pmMeera",
        ]);
    });

    it("says it is finding free times while it reads", async () => {
        listAvailability.mockImplementation(() => new Promise(() => undefined));
        await draw();
        expect(host.textContent).toContain("Finding free times…");
        expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
    });

    it("the arrows move the time, one tab stop for the times", async () => {
        await draw({ value: at("2026-10-20T09:00") });
        const times = radios("Tue 20 Oct");
        expect(times.filter((b) => b.tabIndex === 0)).toHaveLength(1);
        act(() => {
            times[0]?.focus();
            times[0]?.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "ArrowRight",
                    bubbles: true,
                }),
            );
        });
        expect(onChange).toHaveBeenCalledWith(
            at("2026-10-20T10:00"),
            expect.objectContaining({ id: "p_arjun" }),
        );
    });

    it("changing the day clears a picked time", async () => {
        await draw({ value: at("2026-10-20T09:00") });
        act(() => radios("Day")[0]?.click());
        expect(onChange).toHaveBeenCalledWith(null, null);
        expect(host.textContent).toContain("Today 19 Oct");
    });
});

describe("a read that fails", () => {
    it("says it couldn't load times, not that nobody is free, and tries again", async () => {
        listAvailability.mockRejectedValueOnce(new Error("offline"));
        await draw();
        expect(host.textContent).toContain("Couldn't load times");
        expect(host.textContent).not.toContain("No free times");
        expect(host.textContent).not.toContain("Why isn't a time offered?");
        const again = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent === "Try again",
        );
        expect(again).toBeDefined();
        await act(async () => {
            again?.click();
            await Promise.resolve();
        });
        await act(async () => {
            await Promise.resolve();
        });
        expect(listAvailability).toHaveBeenCalledTimes(2);
        expect(host.textContent).not.toContain("Couldn't load times");
        expect(host.textContent).toContain("9:00");
    });
});
