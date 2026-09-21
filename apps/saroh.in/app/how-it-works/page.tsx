import { cn } from "@saroh/ui/lib/utils";
import type { Metadata } from "next";

import { band, body, sectionHeading } from "@/components/site/bits";
import { ClosingCta } from "@/components/site/closing-cta";
import { SwitchDemo } from "@/components/works/switch-demo";
import { ROLES, ROLE_ROWS, STEPS } from "@/lib/site-content";

export const metadata: Metadata = {
    title: "How it works — Saroh",
    description:
        "Make an account, name the business, switch on the job you do. Your sidebar is built from what is on, and your role can differ in every business.",
};

export default function HowItWorks() {
    return (
        <>
            <section className="mx-auto max-w-[900px] px-4 pb-[38px] pt-[52px] sm:px-10">
                <div className="mb-4 font-mono text-[11px] text-muted-foreground">
                    /how-it-works
                </div>
                <h1 className="mb-4 font-display text-[30px] font-semibold leading-[1.04] tracking-[-0.04em] min-[421px]:text-[38px] md:text-[48px]">
                    Four steps, and one of them is naming it
                </h1>
                <p className="mb-[30px] max-w-[60ch] text-pretty text-[18px] leading-[1.6] text-neutral-600 dark:text-neutral-400">
                    Saroh does not ask you to configure anything before you have
                    seen it. You make an account, name the business, and you are
                    in — then you decide what it does for you from inside.
                </p>
                <ol className="flex flex-col gap-3.5">
                    {STEPS.map((step, i) => (
                        <li
                            key={step.title}
                            className="flex items-start gap-4 rounded-[14px] border border-border bg-card px-[21px] py-[19px]"
                        >
                            <span className="shrink-0 pt-[3px] font-mono text-[12px] text-brand">
                                {String(i + 1).padStart(2, "0")}
                            </span>
                            <div className="min-w-0">
                                <h2 className="mb-[5px] text-[16px] font-semibold">
                                    {step.title}
                                </h2>
                                <p className={body}>{step.body}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            </section>

            <section
                className={cn(
                    band,
                    "mx-auto mb-1 max-w-[900px] px-4 pb-[58px] pt-[54px] sm:px-10",
                )}
            >
                <h2 className={cn(sectionHeading, "mb-3")}>
                    Try the switching
                </h2>
                <p className={cn(body, "mb-5 max-w-[58ch]")}>
                    This is the real control, with the real dependency. Turn
                    Bookings on and Contacts comes with it, because a booking
                    needs somewhere to keep the person who made it.
                </p>
                <SwitchDemo />
            </section>

            <section className="mx-auto max-w-[900px] px-4 pb-[54px] pt-[52px] sm:px-10">
                <div className="rounded-[16px] bg-brand-surface px-5 py-7 text-brand-surface-foreground sm:px-[30px]">
                    <h2 className="mb-[11px] font-display text-[22px] font-semibold leading-[1.14] tracking-[-0.03em]">
                        Your role can differ in every business
                    </h2>
                    <p className="mb-[18px] text-pretty text-[16px] leading-[1.6] text-neutral-200">
                        One account holds all of them. You might own the bakery
                        and merely read the books for a friend's studio — so
                        roles are set per business, not per person. A thing your
                        role cannot do says so and why, rather than quietly
                        disappearing.
                    </p>
                    <div className="relative overflow-x-auto rounded-[12px] border border-neutral-600">
                        <table className="w-full min-w-[520px] border-collapse">
                            <caption className="sr-only">
                                What each built-in role can do
                            </caption>
                            <thead>
                                <tr className="bg-neutral-800">
                                    <th
                                        scope="col"
                                        className="px-[15px] py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-200"
                                    >
                                        Can they
                                    </th>
                                    {ROLES.map((role) => (
                                        <th
                                            key={role}
                                            scope="col"
                                            className="w-[84px] px-1 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-200"
                                        >
                                            {role}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {ROLE_ROWS.map((row) => (
                                    <tr
                                        key={row.label}
                                        className="border-t border-neutral-600"
                                    >
                                        <th
                                            scope="row"
                                            className="px-[15px] py-[11px] text-left text-[13px] font-normal"
                                        >
                                            {row.label}
                                        </th>
                                        {row.can.map((can, i) => (
                                            <td
                                                key={ROLES[i]}
                                                className={cn(
                                                    "text-center text-[16px]",
                                                    can
                                                        ? "text-brand-surface-foreground"
                                                        : "text-neutral-400",
                                                )}
                                            >
                                                <span aria-hidden>
                                                    {can ? "●" : "·"}
                                                </span>
                                                <span className="sr-only">
                                                    {can ? "Yes" : "No"}
                                                </span>
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-3 text-pretty text-[13px] leading-[1.55] text-neutral-200">
                        The four roles every business starts with. You can make
                        your own from Team.
                    </p>
                </div>
            </section>

            <ClosingCta />
        </>
    );
}
