import { chequesWaiting } from "@/lib/home/cheques";
import { nextLine } from "@/lib/home/needs";
import type { HomeModel } from "@/lib/home/service";
import { nextBookingSentence, tileViews } from "@/lib/home/tiles";
import { goingCards, goingIntro, showsGoing } from "@/lib/home/week";

import type { HomeSetup } from "./home-setup";
import { HowItsGoing } from "./how-its-going";
import { NeedGroups } from "./need-groups";
import { NeedsYou } from "./needs-you";
import { TakeMoneyChecklist } from "./take-money-checklist";
import { Today } from "./today";
import { TodayTiles } from "./today-tiles";

/**
 * Home A at a desk (DEC-171, Home plan U6, boards `HAPageD`, `HAQuietD`,
 * `HAMondayD`, `HAMemberD`, `HAFailedD`, `HAGettingSetUpD`), from 640px:
 *
 * 1. the tiles: today at a glance, each opening its screen;
 * 2. Needs you, grouped by kind, with Today beside it from a wide desk;
 *    setup at the foot of the work column as one line once most of it is
 *    done (it leads the page, above the tiles, while less than half is);
 * 3. How it's going: the last 7 days against the 7 before, and the way
 *    into Insights.
 *
 * The header, the notice naming a part that couldn't load, and setup while
 * it leads are drawn above, once, by `HomeDashboard`, for both layouts.
 */
export function HomeDesk({
    home,
    setup,
    now,
    insights,
}: {
    home: HomeModel;
    setup: HomeSetup | null;
    now: Date;
    /** Whether "See how the month went" is offered. */
    insights: boolean;
}) {
    const fresh = home.lastDay?.fresh ?? false;
    const today = home.lastDay?.date ?? home.today?.date ?? null;
    const tiles = tileViews({
        tiles: home.tiles,
        unavailable: home.unavailable,
        today,
        fresh,
    });
    const next =
        nextBookingSentence(home.tiles?.bookingsToday, today, "Next booking") ??
        nextLine(home.upcoming, now);
    const going = showsGoing(home.going, fresh) ? goingCards(home.going) : [];
    const groups = home.needGroups;

    return (
        <div className="grid gap-[22px]">
            <TodayTiles tiles={tiles} />

            <div
                className={
                    home.today
                        ? "grid items-start gap-[22px] min-[1100px]:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]"
                        : "grid items-start gap-[22px]"
                }
            >
                {/* `min-w-0` on both columns: a grid item refuses to shrink
                    below its content otherwise (#178, §18). */}
                <div className="grid min-w-0 content-start gap-[18px]">
                    {groups ? (
                        <NeedGroups
                            groups={groups}
                            total={home.needGroupsTotal}
                            inProgress={
                                home.tiles?.toPack?.inProgress ??
                                home.ordersInProgress
                            }
                            unavailable={home.unavailable}
                            next={next}
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
                    {setup ? (
                        <TakeMoneyChecklist {...setup} slot="late" compact />
                    ) : null}
                </div>
                {home.today ? (
                    <div className="grid min-w-0 content-start gap-[18px]">
                        <Today
                            today={home.today}
                            now={now.toISOString()}
                            layout="desk"
                            emptyNext={nextBookingSentence(
                                home.tiles?.bookingsToday,
                                today,
                            )}
                        />
                    </div>
                ) : null}
            </div>

            {going.length > 0 && home.going ? (
                <HowItsGoing
                    cards={going}
                    intro={goingIntro(home.going)}
                    insights={insights}
                />
            ) : null}
        </div>
    );
}
