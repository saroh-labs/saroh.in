import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BookingDays, BookingService, BookingStart } from "./model";
import { OneToOne } from "./steps/one-to-one";
import { Sessions } from "./steps/sessions";
import { WhenStep } from "./steps/when-step";
import { card, optionClasses, quietButton, textAction } from "./styles";

/**
 * How the booking page's states look (starter audit, 12 Oct 2026): loading
 * holds the layout, and chosen, free, unavailable and failed are each told
 * apart by more than a colour. What the flow does is in
 * `booking-flow.test.tsx`.
 */

const ZONE = "Asia/Kolkata";

const cut: BookingService = {
    id: "svc_cut",
    name: "Haircut",
    description: null,
    durationMinutes: 45,
    kind: "one",
    capacity: 1,
    priceCents: 60000,
    currency: "INR",
    online: false,
    staff: ["Asha"],
};

const start = (at: string, placesLeft: number | null = null): BookingStart => ({
    startAt: at,
    endAt: at,
    staffId: null,
    staffName: null,
    placesLeft,
});

const days: BookingDays = {
    timezone: ZONE,
    kind: "one",
    capacity: 1,
    days: [
        {
            date: "2026-10-12",
            open: true,
            starts: [
                start("2026-10-12T04:30:00.000Z"),
                start("2026-10-12T05:30:00.000Z"),
            ],
        },
        { date: "2026-10-13", open: true, starts: [] },
    ],
};

const when = (over: Partial<Parameters<typeof WhenStep>[0]>) => (
    <WhenStep
        daysState={{ kind: "loading", serviceId: cut.id }}
        days={null}
        isClass={false}
        day={null}
        sessions={[]}
        more={false}
        zone={ZONE}
        service={cut}
        chosen={null}
        business="Rye Studio"
        onRetry={() => undefined}
        onDay={() => undefined}
        onStart={() => undefined}
        onMore={() => undefined}
        {...over}
    />
);

describe("the booking page while its times are read", () => {
    it("holds the shape of what is coming: two weeks of days and a row of times", () => {
        render(when({}));
        const loading = screen.getByRole("status", { name: "Loading times" });
        expect(loading).toHaveAttribute("data-times-loading");
        // Fourteen day cells, as the strip will have.
        expect(loading.querySelectorAll(".h-\\[62px\\]")).toHaveLength(14);
        expect(loading.querySelectorAll(".h-\\[45px\\]")).toHaveLength(1);
        // The step's heading is there already, so nothing moves under it.
        expect(
            screen.getByRole("heading", { level: 2, name: "When?" }),
        ).toBeVisible();
    });

    it("holds rows for a class's sessions instead", () => {
        render(when({ isClass: true }));
        const loading = screen.getByRole("status", { name: "Loading times" });
        expect(loading.querySelectorAll(".h-\\[60px\\]")).toHaveLength(3);
        expect(loading.querySelectorAll(".h-\\[62px\\]")).toHaveLength(0);
    });
});

describe("the booking page when its times could not be read", () => {
    it("says so as an alert and offers another go, 44px under a finger", () => {
        const onRetry = vi.fn();
        render(
            when({
                daysState: {
                    kind: "error",
                    serviceId: cut.id,
                    message: "",
                    gone: false,
                },
                onRetry,
            }),
        );
        expect(screen.getByRole("alert")).toHaveTextContent(
            "We couldn't load the times. Please try again.",
        );
        const again = screen.getByRole("button", { name: "Try again" });
        expect(again.className).toContain("coarse:min-h-11");
        expect(again.className).toContain("cursor-pointer");
        again.click();
        expect(onRetry).toHaveBeenCalledOnce();
    });

    it("offers no retry for a service that stopped taking bookings", () => {
        render(
            when({
                daysState: {
                    kind: "error",
                    serviceId: cut.id,
                    message: "",
                    gone: true,
                },
            }),
        );
        expect(screen.getByRole("alert")).toHaveTextContent(
            "This isn't taking bookings online right now.",
        );
        expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    });
});

describe("a day and a time, by state", () => {
    const strip = (chosen: BookingStart | null) =>
        render(
            <OneToOne
                days={days}
                day={days.days[0] ?? null}
                zone={ZONE}
                staff={["Asha"]}
                chosen={chosen}
                onDay={() => undefined}
                onStart={() => undefined}
                business="Rye Studio"
            />,
        );

    it("tells the chosen day, a free day and a day with nothing free apart by shape", () => {
        strip(null);
        const buttons = Array.from(
            screen
                .getByRole("radiogroup", { name: "Day" })
                .querySelectorAll("button"),
        );
        const on = buttons.at(0);
        const off = buttons.at(1);
        expect(on).toHaveAttribute("aria-checked", "true");
        expect(on?.className).toContain("bg-site-fg");
        expect(off).toBeDisabled();
        expect(off?.className).toContain("border-dashed");
        expect(off?.className).toContain("cursor-not-allowed");
        // Never faded: its date still reads.
        expect(off?.className).not.toMatch(/opacity-\d/);
    });

    it("gives a free time a state for the pointer and the press, and the chosen one the ink", () => {
        const first = days.days[0]?.starts[0] ?? null;
        strip(first);
        const times = screen.getAllByRole("radio", { name: /am|pm/ });
        const chosen = times.find(
            (t) => t.getAttribute("aria-checked") === "true",
        );
        const free = times.find(
            (t) => t.getAttribute("aria-checked") === "false",
        );
        expect(chosen?.className).toContain("bg-site-fg");
        expect(free?.className).toContain("hover:border-site-fg");
        expect(free?.className).toContain("active:scale-[0.97]");
        // 45px tall: over the 44px a thumb needs.
        expect(free?.className).toContain("h-[45px]");
    });

    it("says no times this week in words, with the ways to reach the business", () => {
        render(
            <OneToOne
                days={{
                    ...days,
                    days: [{ date: "2026-10-13", open: true, starts: [] }],
                }}
                day={null}
                zone={ZONE}
                staff={["Asha"]}
                chosen={null}
                onDay={() => undefined}
                onStart={() => undefined}
                business="Rye Studio"
                reach={{ phone: "+918040992210", whatsapp: null }}
            />,
        );
        expect(
            screen.getByText(/Nothing free in the next two weeks\./),
        ).toBeVisible();
        expect(screen.getByRole("link", { name: /^Call / })).toBeVisible();
    });
});

describe("a class that is full, with no waitlist", () => {
    it("is off, dashed and quiet, and still says it is full", () => {
        render(
            <Sessions
                sessions={[
                    start("2026-10-12T04:30:00.000Z", 0),
                    start("2026-10-13T04:30:00.000Z", 4),
                ]}
                more={false}
                onMore={() => undefined}
                zone={ZONE}
                duration={60}
                chosen={null}
                onPick={() => undefined}
            />,
        );
        const rows = screen.getAllByRole("radio");
        const full = rows.at(0);
        const open = rows.at(1);
        expect(full).toBeDisabled();
        expect(full?.className).toContain("border-dashed");
        expect(full?.className).not.toMatch(/opacity-\d/);
        expect(full).toHaveTextContent(/full/i);
        expect(open).not.toBeDisabled();
        expect(open?.className).not.toContain("border-dashed");
    });
});

describe("the booking page's shared shapes", () => {
    it("tells a chosen row from the rest by its edge and bar, and answers the pointer", () => {
        expect(optionClasses(true)).toContain("border-site-accent");
        expect(optionClasses(true)).toContain("shadow-[inset_3px_0_0");
        expect(optionClasses(false)).toContain("hover:border-site-fg");
        expect(optionClasses(false)).not.toContain("border-site-accent");
    });

    it("keeps every quiet button and text action 44px under a finger, with a ring", () => {
        expect(quietButton).toContain("h-11");
        expect(quietButton).toContain("focus-visible:ring-2");
        expect(textAction).toContain("coarse:min-h-11");
        expect(textAction).toContain("focus-visible:ring-2");
    });

    it("gives a card less padding on a phone, where the day strip needs the width", () => {
        expect(card).toContain("p-[22px]");
        expect(card).toContain("max-[699px]:p-4");
    });
});
