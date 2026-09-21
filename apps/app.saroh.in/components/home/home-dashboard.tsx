import { Button } from "@saroh/ui/button";
import { EmptyState, PartialNotice } from "@saroh/ui/data-state";
import { Home } from "lucide-react";
import Link from "next/link";

import { firstRunJobs } from "@/lib/home/first-run";
import type { HomeModel } from "@/lib/home/service";
import type { ModuleView } from "@/lib/modules/schema";

import { FirstRunJobs } from "./first-run-jobs";
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

export function HomeDashboard({
    home,
    modules,
    businessName,
}: {
    home: HomeModel;
    /** Read only for a business with nothing on — the first-run question. */
    modules: ModuleView[] | null;
    businessName: string;
}) {
    // Nothing on yet: ask what the business wants to do, on Home itself,
    // rather than an empty dashboard whose every band says "nothing yet".
    if (!home.hasAnyModule) {
        return <FirstRun modules={modules ?? []} businessName={businessName} />;
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
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        Needs you
                    </h2>
                    <NeedsYou actions={home.actions} now={now} />
                </div>

                {showSchedule ? (
                    <div className="min-w-0 space-y-3">
                        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            Schedule
                        </h2>
                        <Schedule bookings={home.upcoming} now={now} />
                    </div>
                ) : null}
            </div>

            {home.numbers.length > 0 ? (
                <div className="space-y-3">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        Your numbers
                    </h2>
                    <NumbersBand numbers={home.numbers} />
                </div>
            ) : null}
        </div>
    );
}

/**
 * The first-run branch. Only someone who may turn capabilities on is asked
 * which to turn on; offering a choice they cannot act on is the dead-end
 * pattern in another costume. Everyone else is told who makes it, so an empty
 * Home never reads as a broken one.
 */
function FirstRun({
    modules,
    businessName,
}: {
    modules: ModuleView[];
    businessName: string;
}) {
    const jobs = firstRunJobs(modules);
    if (jobs.length > 0) return <FirstRunJobs modules={modules} jobs={jobs} />;

    // May turn things on, just none of the four starting jobs: the full list
    // is still theirs, so point at it rather than saying nobody can.
    if (modules.some((m) => m.canManage && m.lifecycle !== "ENABLED")) {
        return (
            <EmptyState
                icon={<Home aria-hidden />}
                title="Nothing is turned on yet"
                description={`Pick what Saroh does for ${businessName}. Each one adds its own rows to the sidebar, and nothing is lost if you turn it off again.`}
                action={
                    <Button asChild variant="brand">
                        <Link href="/onboarding/modules">
                            Choose what it does
                        </Link>
                    </Button>
                }
            />
        );
    }

    return (
        <EmptyState
            icon={<Home aria-hidden />}
            title="Nothing is turned on yet"
            description={`${businessName} has not picked what Saroh does for it. Once someone who manages it does, the work shows up here and in the sidebar.`}
        />
    );
}
