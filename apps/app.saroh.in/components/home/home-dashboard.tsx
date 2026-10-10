import { Button } from "@saroh/ui/button";
import { EmptyState, PartialNotice } from "@saroh/ui/data-state";
import { Home } from "lucide-react";
import Link from "next/link";

import { upgradeHref } from "@/lib/billing/access";
import type { InvoiceJobFacts } from "@/lib/home/first-run";
import {
    firstRunJobs,
    heldByPlan,
    mayManageModules,
    onButNotOpen,
} from "@/lib/home/first-run";
import { formatList, nextLine } from "@/lib/home/needs";
import type { HomeModel } from "@/lib/home/service";
import { showsWeek, weekRows } from "@/lib/home/week";
import { rolledOut } from "@/lib/modules/rollout";
import type { ModuleView } from "@/lib/modules/schema";
import type { ReadyChecklist } from "@/lib/settings/ready";

import { FirstRunJobs } from "./first-run-jobs";
import { NeedsYou } from "./needs-you";
import { TakeMoneyChecklist } from "./take-money-checklist";
import { ThisWeek } from "./this-week";
import { Today } from "./today";

/** "Get ready to take money", for someone who may change the business. */
export interface HomeSetup {
    list: ReadyChecklist;
    businessId: string;
}

/**
 * Home as a dashboard rather than a menu (#119, redesign step 3).
 *
 * Two bands, in the order a merchant opening the app actually asks:
 *
 * 1. **Needs you** — one flat, ranked list, a row per thing to do with a tag
 *    that says what is wrong (F3), so the decision is made here rather than
 *    two clicks later.
 * 2. **Today** — the business's day in time order, with who has arrived
 *    (F5). Days after today are the calendar's.
 *
 * Beside them, **This week** (F7): takings against the same days last week,
 * the week's bookings and orders, and what is owed — each figure only for
 * whoever may read it, which the API decides.
 *
 * The counts that used to close the page as a band of tiles folded into the
 * header's "Last 24 hours" (F6, `home-header.tsx`): what changed since
 * yesterday, each a link to its rows. The standing totals they showed are the
 * work itself now — open orders are Needs you's rows, today's bookings are
 * Today's — and the rest are a click away in the rail.
 *
 * `now` is captured once and threaded down so every relative time on the page
 * ("3 days overdue", "Today") is measured from the same instant. Letting each
 * component call `new Date()` would let a slow render disagree with itself.
 */
export function HomeDashboard({
    home,
    modules,
    businessName,
    setup = null,
    kind,
    invoicing,
}: {
    home: HomeModel;
    /** Read only for a business with nothing on — the first-run question. */
    modules: ModuleView[] | null;
    businessName: string;
    /** Null for someone who may not change the business (`org:update`). */
    setup?: HomeSetup | null;
    /**
     * What is being set up (DEC-070): the first-run jobs' order and words.
     * Absent, a business's.
     */
    kind?: string;
    /** For "Invoice a client"; absent, it isn't offered. */
    invoicing?: InvoiceJobFacts;
}) {
    // Nothing on yet: ask what the business wants to do, on Home itself,
    // rather than an empty dashboard whose every band says "nothing yet".
    if (!home.hasAnyModule) {
        return (
            <FirstRun
                modules={modules ?? []}
                businessName={businessName}
                kind={kind}
                invoicing={invoicing}
            />
        );
    }

    const now = new Date();
    // A business with nothing sold, booked or paid yet gets no week (F7).
    const week = showsWeek(home.week, home.lastDay?.fresh ?? false)
        ? weekRows(home.week)
        : [];

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

            {/* The design's row: the work column, and beside it This week
                (F7); it wraps under below 1100px. */}
            <div className="flex flex-wrap items-start gap-5">
                {/* `min-w-0` is required, not tidiness: a flex item defaults
                    to `min-width: auto`, so this column refused to shrink below
                    its content's min-content width and pushed the whole page
                    into a horizontal scroll at 320px (#178, §18). */}
                <div className="grid min-w-0 flex-[1_1_520px] content-start gap-5">
                    {/* "Get ready to take money" leads while fewer than half
                        its steps are done, and moves to the foot of the
                        column once more are; each slot draws only when it's
                        the checklist's place (F8). */}
                    {setup ? (
                        <TakeMoneyChecklist {...setup} slot="first" />
                    ) : null}
                    <NeedsYou
                        needs={home.needs}
                        total={home.needsTotal}
                        unavailable={home.unavailable}
                        next={nextLine(home.upcoming, now)}
                    />
                    {/* Under Needs you, as the design stacks them: the work
                        first, then the day it happens in. The API sends no
                        block to someone who reads neither bookings nor
                        orders, so the column never advertises a module
                        that is off. */}
                    {home.today ? (
                        <Today today={home.today} now={now.toISOString()} />
                    ) : null}
                    {setup ? (
                        <TakeMoneyChecklist {...setup} slot="late" />
                    ) : null}
                </div>
                <ThisWeek rows={week} />
            </div>
        </div>
    );
}

/**
 * The first-run branch. Only someone who may turn capabilities on is asked
 * which to turn on; offering a choice they cannot act on is the dead-end
 * pattern in another costume. Everyone else is told who makes it, so an empty
 * Home never reads as a broken one.
 *
 * Each state says `data-ph-unmask`: this is setup, before the business has
 * anything of a customer's, and a session recording reads it in full
 * (DEC-125, 10 Oct). The one thing in it that isn't Saroh's own words is
 * the business's own name.
 */
function FirstRun({
    modules,
    businessName,
    kind,
    invoicing,
}: {
    modules: ModuleView[];
    businessName: string;
    kind?: string;
    invoicing?: InvoiceJobFacts;
}) {
    const jobs = firstRunJobs(modules, kind, invoicing);
    if (jobs.length > 0) return <FirstRunJobs modules={modules} jobs={jobs} />;

    // May turn things on, just none of the four starting jobs: the full list
    // is still theirs, so point at it rather than saying nobody can.
    if (
        rolledOut(modules).some((m) => m.canManage && m.lifecycle !== "ENABLED")
    ) {
        return (
            <EmptyState
                data-ph-unmask=""
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

    // Turned on, just not for this person's role (a Storefront team member,
    // or a custom role that reads nothing). Saying the business picked
    // nothing would be false.
    if (onButNotOpen(modules)) {
        return (
            <EmptyState
                data-ph-unmask=""
                icon={<Home aria-hidden />}
                title="Nothing here is open to you yet"
                description={`${businessName} runs on Saroh, but your role doesn't reach any of it yet. An owner or admin can change what you can reach, in Team.`}
            />
        );
    }

    const manages = mayManageModules(modules);

    // Turned on, but the plan holds it (#837): the business did pick, so
    // "has not picked" would be false. The owner gets the way to a plan
    // that has it; anyone else, who changes it.
    if (heldByPlan(modules)) {
        return (
            <EmptyState
                data-ph-unmask=""
                icon={<Home aria-hidden />}
                title="What's turned on isn't in your plan"
                description={
                    manages
                        ? `${businessName} has picked what Saroh does for it, but its plan doesn't include it yet. Nothing is lost; it's all here when the plan does.`
                        : `${businessName} has picked what Saroh does for it, but its plan doesn't include it yet. The owner can change the plan in Settings › Plan and billing.`
                }
                action={
                    manages ? (
                        <Button asChild variant="brand">
                            <Link href={upgradeHref()}>See plans</Link>
                        </Button>
                    ) : undefined
                }
            />
        );
    }

    // Someone who may turn things on is never told to wait for someone who
    // manages it (#837): it's them. The full list is theirs.
    if (manages) {
        return (
            <EmptyState
                data-ph-unmask=""
                icon={<Home aria-hidden />}
                title="Nothing is turned on yet"
                description={`Pick what Saroh does for ${businessName}. Each one adds its own rows to the sidebar, and nothing is lost if you turn it off again.`}
                action={
                    <Button asChild variant="brand">
                        <Link href="/settings/modules">
                            Choose what it does
                        </Link>
                    </Button>
                }
            />
        );
    }

    return (
        <EmptyState
            data-ph-unmask=""
            icon={<Home aria-hidden />}
            title="Nothing is turned on yet"
            description={`${businessName} has not picked what Saroh does for it. Once someone who manages it does, the work shows up here and in the sidebar.`}
        />
    );
}
