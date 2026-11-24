"use client";

import { FailedState } from "@saroh/ui/data-state";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { useSearchParams } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";

import {
    NewBookingButton,
    NewBookingHost,
} from "@/components/bookings/new-booking/new-booking-host";
import type { NewBookingSetup } from "@/components/bookings/new-booking/setup";
import { flowStaff } from "@/components/bookings/new-booking/setup";
import { ScreenPending } from "@/components/shared/page/screen-pending";
import { diaryAsk } from "@/lib/bookings/queries";
import {
    BookingSaveContext,
    useBookingSaveWithQuery,
    useBookingsDiary,
} from "@/lib/bookings/use-bookings";
import type { BookingsOpens } from "@/lib/services/bookings-opens";
import {
    nothingChoseView,
    openingLayout,
    openingPerson,
} from "@/lib/services/bookings-opens";
import { calendarHref } from "@/lib/services/calendar-href";
import { localDateOf } from "@/lib/services/diary";

import { CalendarScreen } from "./calendar-screen";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

type ScreenProps = ComponentProps<typeof CalendarScreen>;

/** The New booking button's look on the diary: floats on a phone (U2). */
const NEW_BOOKING =
    "max-[759px]:fixed max-[759px]:bottom-[calc(16px+var(--tab-bar-inset,0px))] max-[759px]:right-4 max-[759px]:z-30 max-[759px]:h-14 max-[759px]:rounded-full max-[759px]:pl-4 max-[759px]:pr-5 max-[759px]:text-[15px] max-[759px]:shadow-xl min-[760px]:h-11 min-[760px]:px-[18px] min-[760px]:text-[14.5px]";

/**
 * The diary on React Query (DEC-259): the address is the key. A day, a
 * week, a layout or a person changes the address in place (`ScreenPending`
 * `inPlace`); a day in the week already read draws at once, another week
 * keeps the last one on screen, greyed, until it lands. Every write on it
 * (the quick look, a free gap, closed time, New booking) goes through the
 * bookings saves: the diary is read once, the list marked stale.
 */
export function DiaryContainer({
    zone,
    now: pageNow,
    userId,
    opens,
    lastUsed,
    services,
    rules,
    notices,
    limitNotice,
    calendarLine,
    share,
    business,
    people,
    can,
    setup,
    arrival,
}: {
    /** The business's zone the page read the days in. */
    zone: string;
    /** The page's now: today until a read says later. */
    now: number;
    userId: string;
    opens: BookingsOpens;
    /** The view last used on this device (its cookie). */
    lastUsed: string | null;
    services: ScreenProps["services"];
    rules: ScreenProps["rules"];
    notices: ScreenProps["notices"];
    limitNotice: ReactNode;
    calendarLine: ReactNode;
    /** "Share your booking page", drawn on a quiet Agenda day. */
    share: ReactNode;
    business: string | null;
    people: ScreenProps["people"];
    can: ScreenProps["can"];
    /** New booking's setup, less the people (read here); null: may not book. */
    setup: Omit<NewBookingSetup, "staff" | "timezone" | "showMoney"> | null;
    arrival: ComponentProps<typeof NewBookingHost>["arrival"];
}) {
    const saves = useBookingSaveWithQuery();
    const search = useSearchParams();
    const params = Object.fromEntries(search);
    // The latest read's now, so a diary left open past midnight moves on.
    const [clock, setClock] = useState(pageNow);
    const today = localDateOf(new Date(clock), zone);
    const date =
        typeof params.date === "string" && DATE.test(params.date)
            ? params.date
            : today;
    const query = useBookingsDiary(diaryAsk(date));
    const data = query.data;
    if (data && data.now > clock) setClock(data.now);

    const chosen = {
        asked: params.layout,
        start: opens.start,
        lastUsed,
    };
    const layout = openingLayout(chosen);

    if (!data) {
        return query.isError ? (
            <FailedState
                title={couldntLoad("the calendar")}
                retryHref={calendarHref(layout, date)}
            />
        ) : null;
    }

    const timezone = data.calendar.timezone || data.zone;
    const active = (data.staff ?? []).filter((p) => p.status === "ACTIVE");
    const mine = active.find((p) => p.membership?.userId === userId);
    const person = openingPerson({
        asked: params.person,
        opens,
        people: active.map((p) => p.id),
        me: mine?.id ?? null,
    });

    const screen = (
        <ScreenPending inPlace={{ pending: query.isPlaceholderData }}>
            <CalendarScreen
                layout={layout}
                date={date}
                today={today}
                now={data.now}
                timezone={timezone}
                calendar={data.calendar}
                staff={data.staff}
                services={services}
                rules={rules}
                notices={notices}
                limitNotice={limitNotice}
                calendarLine={calendarLine}
                serviceHours={data.serviceHours}
                // Cancelled bookings stay off the diary unless the address
                // asks for them, so a reload keeps the choice.
                showCancelled={params.cancelled === "1"}
                googleBusy={data.googleBusy}
                googleShow={
                    params.google === "0"
                        ? "off"
                        : params.google === "mine"
                          ? "mine"
                          : "all"
                }
                person={person}
                opens={opens}
                me={mine ? { id: mine.id, name: mine.name } : null}
                share={layout === "agenda" ? share : null}
                // Nothing chose the view: a phone moves to List (Q4, U6).
                listFirst={nothingChoseView(chosen)}
                business={business}
                people={people}
                can={can}
                newBooking={
                    setup ? (
                        <NewBookingButton
                            // Keyed: it renders among the screen's own children.
                            key="new-booking"
                            // Beside "…" on the desk; on a phone it floats
                            // over the calendar, above the tab bar (U2).
                            className={NEW_BOOKING}
                            date={search.has("date") ? date : null}
                        />
                    ) : null
                }
            />
        </ScreenPending>
    );
    return (
        <BookingSaveContext.Provider value={saves}>
            {setup ? (
                <NewBookingHost
                    setup={{
                        ...setup,
                        staff: flowStaff(data.staff),
                        timezone,
                        showMoney: data.calendar.money,
                    }}
                    arrival={arrival}
                >
                    {screen}
                </NewBookingHost>
            ) : (
                screen
            )}
        </BookingSaveContext.Provider>
    );
}
