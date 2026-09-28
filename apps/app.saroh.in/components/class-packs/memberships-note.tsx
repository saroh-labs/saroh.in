import Link from "next/link";

import type { MembershipPlan } from "@/lib/class-packs/packs-page";
import { classesText } from "@/lib/subscriptions/view";

/**
 * "Memberships include classes too" (round-2 E15, after "Saroh Packs"):
 * the live plans and the classes each gives, linking to Plans (plan D),
 * where they are changed. Drawn only when there are plans to show.
 */
export function MembershipsNote({ plans }: { plans: MembershipPlan[] }) {
    return (
        <section
            aria-labelledby="packs-memberships"
            className="rounded-[12px] border border-border bg-muted/50 px-4 py-3.5"
        >
            <div className="flex flex-wrap items-baseline gap-2.5">
                <h2
                    id="packs-memberships"
                    className="flex-1 text-[14px] font-semibold"
                >
                    Memberships include classes too
                </h2>
                <Link
                    href="/billing/subscriptions?tab=plans"
                    className="rounded-sm text-[12.5px] font-semibold text-brand hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-foreground"
                >
                    Change in Plans
                </Link>
            </div>
            <p className="mt-[3px] text-pretty text-[12.5px] text-muted-foreground">
                Given at each renewal and not carried over. Members use these
                before any pack they own.
            </p>
            <ul className="mt-2 grid">
                {plans.map((p) => (
                    <li
                        key={p.id}
                        className="flex flex-wrap items-baseline gap-2.5 border-t border-border py-2"
                    >
                        <span className="min-w-0 flex-[1_1_160px] text-[13px] font-semibold">
                            {p.name}
                        </span>
                        <span className="min-w-0 flex-[1_1_140px] text-[13px]">
                            {classesText(p.classesPerMonth)}
                        </span>
                        <span className="min-w-0 flex-[1_1_140px] text-[12.5px] text-muted-foreground">
                            {p.subscriberCount > 0
                                ? `${p.subscriberCount} ${p.subscriberCount === 1 ? "member" : "members"}`
                                : "No members yet"}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}
