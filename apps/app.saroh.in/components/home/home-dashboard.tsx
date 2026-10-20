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
import { formatList } from "@/lib/home/needs";
import type { HomeModel } from "@/lib/home/service";
import { rolledOut } from "@/lib/modules/rollout";
import type { ModuleView } from "@/lib/modules/schema";
import { plansShown } from "@/lib/saroh-billing/plans-shown";

import { PlanLockedCard } from "@/components/billing/plan-way";
import { WHO_CAN_CHANGE } from "@/components/shared/who-can-change";
import { FirstRunJobs } from "./first-run-jobs";
import { HomeDesk } from "./home-desk";
import type { HomeSetup } from "./home-setup";
import { PhoneHome } from "./phone/phone-home";
import { TakeMoneyChecklist } from "./take-money-checklist";

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
 * - **Below 640px, the simplified phone Home** (`phone/phone-home.tsx`,
 *   plan U17, `HPHome`): three figures, the Next line, Needs you as one
 *   line per group, How it's going in a sentence, setup in one line; each
 *   line opens its sheet.
 *
 * Above both, drawn once: "Finish setup" when it has just finished, and
 * while it leads (fewer than half its steps done) at a desk; the phone
 * draws its own card for that. What couldn't be read is one notice at a
 * desk; on a phone it is the first line of Needs you, with Try again.
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
                <div className="hidden sm:block">
                    <PartialRead
                        things={formatList(
                            home.unavailable.map((part) => part.label),
                        )}
                        so="Everything else is here, so there may be more to do."
                    />
                </div>
            ) : null}

            {/* "Finish setup" leads while fewer than half its steps are
                done, and has its last word here once they all are (F8);
                drawn once for both layouts. */}
            {setup ? (
                <TakeMoneyChecklist {...setup} slot="first" phoneOwnCard />
            ) : null}

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
