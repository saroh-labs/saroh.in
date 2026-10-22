import type { MembershipPlan } from "@/lib/class-packs/packs-page";
import { count } from "@/lib/format/plural";
import { classesText } from "@/lib/subscriptions/view";
import { TextLink } from "@saroh/ui/text-link";

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
                <TextLink
                    href="/billing/subscriptions?tab=plans"
                    className="text-[12.5px]"
                >
                    Change in Plans
                </TextLink>
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
                                ? count(p.subscriberCount, "member")
                                : "No members yet"}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}
