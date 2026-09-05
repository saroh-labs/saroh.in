import { Button } from "@saroh/ui/button";
import { EmptyState, PartialNotice } from "@saroh/ui/data-state";
import Link from "next/link";

import type { HomeModel } from "@/lib/home/service";

import { NeedsYou } from "./needs-you";
import { NumbersBand } from "./numbers-band";
import { Schedule } from "./schedule";

/**
 * Home as a dashboard rather than a menu (#119, redesign step 3).
 *
 * Three bands, in the order a merchant opening the app actually asks:
 *
 * 1. **Needs you** — the ranked work, each action carrying the rows behind its
 *    count so the decision is made here rather than two clicks later.
 * 2. **Coming up** — the schedule on a time axis, grouped by day.
 * 3. **Numbers** — counts that are links into exactly what they count.
 *
 * Numbers sit LAST, not first. The dashboard convention is a row of stat tiles
 * across the top, but a merchant opening this page has a question — "what needs
 * me?" — and answering it with a wall of counts puts the least actionable thing
 * in the most valuable space. The work leads; the totals are reference.
 *
 * `now` is captured once and threaded down so every relative time on the page
 * ("3 days overdue", "Today") is measured from the same instant. Letting each
 * component call `new Date()` would let a slow render disagree with itself.
 */
/** "Open orders", "Open orders and Schedule", "A, B and C". */
function formatList(labels: string[]): string {
    if (labels.length <= 1) return labels[0] ?? "";
    return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export function HomeDashboard({ home }: { home: HomeModel }) {
    // Brand-new / no modules enabled → guide to need-based setup, not an empty
    // dashboard whose every band says "nothing yet".
    if (!home.hasAnyModule) {
        return (
            <EmptyState
                title="Let's set up your workspace"
                description="Turn on the capabilities your business needs — a website, appointments, a store, or all of them. You can change this anytime."
                action={
                    <Button asChild variant="brand">
                        <Link href="/onboarding/modules">
                            Choose what you need
                        </Link>
                    </Button>
                }
            />
        );
    }

    const now = new Date();
    // The schedule band is Appointments-only; the API sends nothing for a
    // merchant without it, and an empty "Coming up" panel would advertise a
    // capability they have not turned on.
    const showSchedule = home.upcoming.length > 0;

    return (
        <div className="space-y-6">
            {/* Say what is missing BEFORE the bands, not after: a merchant who
                scans the top of Home and leaves must not carry away a picture
                they think is complete (§30). Naming the parts is the point —
                "something went wrong" would not tell them whether the thing
                they came to check is the thing that is missing. */}
            {home.unavailable.length > 0 ? (
                <PartialNotice>
                    {formatList(home.unavailable.map((part) => part.label))}{" "}
                    could not be loaded, so this is not the whole picture.
                </PartialNotice>
            ) : null}

            <div
                className={
                    showSchedule
                        ? "grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
                        : ""
                }
            >
                {/* `min-w-0` is required, not tidiness: a grid item defaults
                    to `min-width: auto`, so this column refused to shrink below
                    its content's min-content width and pushed the whole page
                    into a horizontal scroll at 320px (#178, §18). */}
                <div className="min-w-0 space-y-3">
                    <h2 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                        Needs you
                    </h2>
                    <NeedsYou actions={home.actions} now={now} />
                </div>

                {showSchedule ? (
                    <div className="min-w-0 space-y-3">
                        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                            Schedule
                        </h2>
                        <Schedule bookings={home.upcoming} now={now} />
                    </div>
                ) : null}
            </div>

            {home.numbers.length > 0 ? (
                <div className="space-y-3">
                    <h2 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                        Your numbers
                    </h2>
                    <NumbersBand numbers={home.numbers} />
                </div>
            ) : null}
        </div>
    );
}
