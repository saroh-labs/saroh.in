import { chequesWaiting } from "@/lib/home/cheques";
import { sinceLinks } from "@/lib/home/last-day";
import { nextLine } from "@/lib/home/needs";
import { phoneFigures, phoneNext } from "@/lib/home/phone-home";
import type { HomeModel } from "@/lib/home/service";
import { nextBookingSentence } from "@/lib/home/tiles";
import { showsGoing } from "@/lib/home/week";

import type { HomeSetup } from "../home-setup";
import { NeedsYou } from "../needs-you";
import { DaySheet, SinceYesterday } from "./day-sheet";
import { PhoneFigures } from "./phone-figures";
import { PhoneGoingLine } from "./phone-going-line";
import { PhoneNeeds } from "./phone-needs-list";
import { PhoneSetup } from "./setup-sheet";

/**
 * Home on a phone, simplified (DEC-171, plan U17, boards `HPHome`,
 * `HPSheets`, `HPMore`, `HPStates`), below 640px. The owner found every
 * earlier phone Home too cluttered; this one is a first screen of lines,
 * each opening what it stands for:
 *
 * 1. setup while it leads (fewer than half its steps done), as a card;
 * 2. three figures (A1), each opening its screen;
 * 3. the Next line, opening the day: Since yesterday, the day's rows with
 *    Mark arrived and Didn't come, Open the calendar;
 * 4. Needs you, one line per group (five, then Show N more), each opening
 *    its rows and actions in a sheet;
 * 5. How it's going, one sentence and the way into Insights;
 * 6. setup once most of it is done, one line that can be hidden.
 *
 * The + is New's (`new-sheet.tsx`, U5), drawn with the header. Nothing the
 * old phone Home offered is gone: the plan's "Capabilities today that must
 * stay" table says where each thing lives now.
 */
export function PhoneHome({
    home,
    setup,
    now,
    insights,
}: {
    home: HomeModel;
    setup: HomeSetup | null;
    now: Date;
    insights: boolean;
}) {
    const fresh = home.lastDay?.fresh ?? false;
    const today = home.lastDay?.date ?? home.today?.date ?? null;
    // A business with nothing sold, booked or paid yet has no day to
    // count: its first screen is setup and what will show (`HPStates`).
    const figures = fresh
        ? []
        : phoneFigures({ tiles: home.tiles, unavailable: home.unavailable });
    const next = fresh
        ? null
        : phoneNext({ tiles: home.tiles, today: home.today, now });
    const since = sinceLinks(home.lastDay);
    const groups = home.needGroups;

    return (
        // `min-w-0`: a grid item refuses to shrink below its content
        // otherwise, and the page scrolls sideways at 320px (#178, §18).
        <div
            data-phone-home=""
            className="grid min-w-0 content-start gap-[18px]"
        >
            {setup ? <PhoneSetup {...setup} slot="first" /> : null}

            <PhoneFigures figures={figures} />

            {next ? (
                <DaySheet
                    next={next}
                    today={home.today}
                    since={since}
                    date={today}
                    now={now.toISOString()}
                    emptyNext={nextBookingSentence(
                        home.tiles?.bookingsToday,
                        today,
                    )}
                />
            ) : (
                // No day to open: the last 24 hours stay on Home itself.
                <SinceYesterday links={since} />
            )}

            {groups ? (
                <PhoneNeeds
                    groups={groups}
                    total={home.needGroupsTotal}
                    inProgress={
                        home.tiles?.toPack?.inProgress ?? home.ordersInProgress
                    }
                    unavailable={home.unavailable}
                    fresh={fresh}
                    dueToday={home.tiles?.toPack?.dueToday ?? 0}
                    cheques={chequesWaiting(home.week)}
                />
            ) : (
                // An API from before Home A (U1): the flat list.
                <NeedsYou
                    needs={home.needs}
                    total={home.needsTotal}
                    inProgress={home.ordersInProgress}
                    unavailable={home.unavailable}
                    next={nextLine(home.upcoming, now)}
                />
            )}

            {home.going && showsGoing(home.going, fresh) ? (
                <PhoneGoingLine going={home.going} insights={insights} />
            ) : null}

            {setup ? <PhoneSetup {...setup} slot="late" /> : null}
        </div>
    );
}
