import { PartialRead } from "@/components/shared/failed-read";
import { Button } from "@saroh/ui/button";
import { EmptyState, PermissionDeniedState } from "@saroh/ui/data-state";
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
import { goingCards, goingIntro, showsGoing } from "@/lib/home/week";
import { rolledOut } from "@/lib/modules/rollout";
import type { ModuleView } from "@/lib/modules/schema";
import { plansShown } from "@/lib/saroh-billing/plans-shown";

import { PlanLockedCard } from "@/components/billing/plan-way";
import { WHO_CAN_CHANGE } from "@/components/shared/who-can-change";
import { FirstRunJobs } from "./first-run-jobs";
import { HomeDesk } from "./home-desk";
import type { HomeSetup } from "./home-setup";
import { HowItsGoing } from "./how-its-going";
import { NeedsYou } from "./needs-you";
import { TakeMoneyChecklist } from "./take-money-checklist";
import { Today } from "./today";

export type { HomeSetup } from "./home-setup";

/**
 * Home as a dashboard rather than a menu (#119), and since DEC-171 Home A,
 * "Today first". Two layouts over the same parts, chosen at 640px by CSS
 * (never a script reading the width, which would draw the desk first on
 * every phone):
 *
 * - **From 640px, Home A** (`home-desk.tsx`, plan U6): the tiles, Needs
 *   you grouped by kind with Today beside it, How it's going, and setup in
 *   one line once most of it is done.
 * - **Below 640px, the phone's Home as it was** (`PhoneHome` below): Needs
 *   you as one ranked list, Today, setup, and How it's going in place of
 *   This week. U17 replaces it with the simplified phone Home (`HPHome`)
 *   from the same parts; nothing else here needs to change for that.
 *
 * Above both, drawn once: what couldn't be read, and "Finish setup" while
 * it leads (fewer than half its steps done) or has just finished.
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
    insights = false,
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
    /** Whether Insights is open to them: "See how the month went". */
    insights?: boolean;
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

    return (
        <div className="grid gap-[22px]">
            {/* Say what is missing BEFORE the bands, not after: a merchant who
                scans the top of Home and leaves must not carry away a picture
                they think is complete (§30). Naming the parts is the point —
                "something went wrong" would not tell them whether the thing
                they came to check is the thing that is missing. */}
            {home.unavailable.length > 0 ? (
                <PartialRead
                    things={formatList(
                        home.unavailable.map((part) => part.label),
                    )}
                    so="Everything else is here, so there may be more to do."
                />
            ) : null}

            {/* "Finish setup" leads while fewer than half its steps are
                done, and has its last word here once they all are (F8);
                drawn once for both layouts. */}
            {setup ? <TakeMoneyChecklist {...setup} slot="first" /> : null}

            <div data-home-layout="desk" className="hidden sm:block">
                <HomeDesk
                    home={home}
                    setup={setup}
                    now={now}
                    insights={insights}
                />
            </div>
            <div data-home-layout="phone" className="sm:hidden">
                <PhoneHome
                    home={home}
                    setup={setup}
                    now={now}
                    insights={insights}
                />
            </div>
        </div>
    );
}

/**
 * The phone's Home, as it was before Home A (round 2): Needs you as one
 * ranked list, the day under it, setup at the foot, then How it's going.
 * U17 replaces this function with the simplified phone Home (`HPHome`).
 */
function PhoneHome({
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
    // A business with nothing sold, booked or paid yet gets no figures (F7).
    const going = showsGoing(home.going, fresh) ? goingCards(home.going) : [];
    return (
        // `min-w-0` is required, not tidiness: a grid item defaults to
        // `min-width: auto`, so the column refused to shrink below its
        // content's min-content width and pushed the whole page into a
        // horizontal scroll at 320px (#178, §18).
        <div className="grid min-w-0 content-start gap-5">
            <NeedsYou
                needs={home.needs}
                total={home.needsTotal}
                inProgress={home.ordersInProgress}
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
            {setup ? <TakeMoneyChecklist {...setup} slot="late" /> : null}
            {going.length > 0 && home.going ? (
                <HowItsGoing
                    cards={going}
                    intro={goingIntro(home.going)}
                    insights={insights}
                    layout="stack"
                />
            ) : null}
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
            <PermissionDeniedState
                data-ph-unmask=""
                title="Nothing here is open to you yet"
                description={`${businessName} runs on Saroh, but your role doesn't include any of it yet.`}
                note={WHO_CAN_CHANGE}
            />
        );
    }

    const manages = mayManageModules(modules);

    // Turned on, but the plan holds it (#837): the business did pick, so
    // "has not picked" would be false. The owner gets the way to a plan
    // that has it; anyone else, who changes it. Not while plans aren't
    // shown (DEC-136): Home then says what is true without naming one.
    if (plansShown() && heldByPlan(modules)) {
        return (
            <PlanLockedCard
                name="What's turned on"
                title="What's turned on isn't in your plan"
                href={upgradeHref()}
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
