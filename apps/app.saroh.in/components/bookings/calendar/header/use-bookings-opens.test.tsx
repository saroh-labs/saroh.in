// @vitest-environment jsdom
/**
 * Where Bookings opens (DEC-170), kept as you pick: a read of the page
 * that lands while a pick is on its way, or that only repeats what was
 * read, doesn't put the old choice back on screen.
 */
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BookingsOpens } from "@/lib/services/bookings-opens";
import { OPENS_DEFAULT } from "@/lib/services/bookings-opens";

import { useBookingsOpens } from "./use-bookings-opens";

const save = vi.fn();
vi.mock("@/lib/services/bookings-opens-actions", () => ({
    saveBookingsOpens: (change: Partial<BookingsOpens>) =>
        save(change) as unknown,
}));
vi.mock("@saroh/ui/toast", () => ({ showError: vi.fn() }));

type Api = ReturnType<typeof useBookingsOpens>;
const seen: { api: Api | null } = { api: null };
const api = () => {
    if (!seen.api) throw new Error("Not rendered");
    return seen.api;
};
function Probe({ initial }: { initial: BookingsOpens }) {
    const opens = useBookingsOpens(initial);
    useEffect(() => {
        seen.api = opens;
    });
    return null;
}

let root: Root;
const draw = (initial: BookingsOpens) =>
    act(() => root.render(<Probe initial={initial} />));

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    save.mockReset();
    root = createRoot(document.createElement("div"));
});
afterEach(() => {
    act(() => root.unmount());
});

describe("useBookingsOpens", () => {
    it("keeps a pick on screen while the page's older read lands", async () => {
        let answer: (v: unknown) => void = () => undefined;
        save.mockImplementation(
            () =>
                new Promise((r) => {
                    answer = r;
                }),
        );
        draw({ ...OPENS_DEFAULT });
        act(() => void api().change({ showFor: "all" }));
        // The navigation's read, from before the pick was kept.
        draw({ ...OPENS_DEFAULT });
        expect(api().opens.showFor).toBe("all");
        await act(async () => {
            answer({ ok: true, data: { showFor: "all" } });
            await Promise.resolve();
        });
        // A refresh that says the same as before is no news either.
        draw({ ...OPENS_DEFAULT });
        expect(api().opens.showFor).toBe("all");
    });

    it("takes in a read that says something new", () => {
        draw({ ...OPENS_DEFAULT });
        draw({ ...OPENS_DEFAULT, lastPerson: "meera" });
        expect(api().opens.lastPerson).toBe("meera");
    });
});
