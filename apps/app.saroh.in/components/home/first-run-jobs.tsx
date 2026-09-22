"use client";

import { showError, showUndo } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { FirstRunJob } from "@/lib/home/first-run";
import { sidebarName } from "@/lib/home/first-run";
import { setModuleStatusAction } from "@/lib/modules/actions";
import type { ModuleView } from "@/lib/modules/schema";

/**
 * Home for a business with nothing turned on (Saroh Workspace, "the choice
 * onboarding stopped making"). Instead of an empty dashboard it asks the one
 * question that fills it, and a pick takes effect HERE: the capability turns
 * on, the sidebar grows its rows, and Home re-renders as a business that does
 * something. No second screen between the question and the answer.
 *
 * What a pick pulls in is SHOWN before the click: picking bookings quietly
 * turning on a second capability is something to be told, not to discover in
 * the sidebar afterwards. The rules live in `lib/home/first-run.ts`.
 */

/** Why a job needs what it drags in, where the design says it in its own words. */
const NEEDS_NOTE: Partial<Record<string, string>> = {
    APPOINTMENTS: "Bookings need someone to book, so Contacts comes with it.",
};

export function FirstRunJobs({
    modules,
    jobs,
}: {
    modules: ModuleView[];
    jobs: FirstRunJob[];
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const nameOf = (key: string) => sidebarName(modules, key);

    const take = (job: FirstRunJob) =>
        startTransition(async () => {
            const turnOn = [...job.pulls, job.key];
            const done: string[] = [];
            for (const key of turnOn) {
                const result = await setModuleStatusAction(key, "ENABLED");
                if (!result.ok) {
                    // Stop at the first refusal: half a job switched on is
                    // worse than a clear error, and the cards are still here.
                    showError(`Could not turn on ${job.verb.toLowerCase()}`);
                    break;
                }
                done.push(key);
            }
            router.refresh();
            if (done.length !== turnOn.length) return;

            const pulled = job.pulls.map(nameOf);
            // Named as the sidebar names it ("Website is on"), not by the
            // card's verb, which read as "Put up a website is on".
            showUndo(
                `${nameOf(job.key)} is on — look at the sidebar` +
                    (pulled.length > 0
                        ? `, ${pulled.join(" and ")} came with it`
                        : ""),
                () =>
                    startTransition(async () => {
                        // Dependants before what they depend on.
                        for (const key of [...done].reverse()) {
                            const result = await setModuleStatusAction(
                                key,
                                "DISABLED",
                            );
                            if (!result.ok) {
                                showError(result.error);
                                break;
                            }
                        }
                        router.refresh();
                    }),
            );
        });

    return (
        <section aria-labelledby="first-run-title" aria-busy={pending}>
            <h2
                id="first-run-title"
                className="mb-[5px] font-display text-[21px] font-semibold tracking-[-0.025em]"
            >
                What do you want to do first?
            </h2>
            <p className="mb-3.5 max-w-[62ch] text-pretty text-[12.5px] leading-[1.55] text-neutral-600 dark:text-neutral-400">
                Pick one and it appears in the sidebar. You are not committing
                to anything — add or drop these whenever.
            </p>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(232px,100%),1fr))] gap-3">
                {jobs.map((job) => {
                    const { pulls } = job;
                    const needsNote =
                        pulls.length > 0
                            ? (NEEDS_NOTE[job.key] ??
                              `${pulls.map(nameOf).join(" and ")} comes with it.`)
                            : null;
                    return (
                        <button
                            key={job.key}
                            type="button"
                            disabled={pending}
                            onClick={() => take(job)}
                            aria-label={`${job.verb}. Adds ${job.gives} to the sidebar${
                                pulls.length > 0
                                    ? `, and ${pulls.map(nameOf).join(" and ")} with it`
                                    : ""
                            }.`}
                            className="wk-press flex min-h-11 w-full min-w-0 flex-col items-start gap-[5px] rounded-[12px] border border-border bg-card px-[18px] py-[17px] text-left text-foreground transition-colors hover:border-neutral-400 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                        >
                            <span className="text-[14px] font-semibold">
                                {job.verb}
                            </span>
                            <span className="text-pretty text-[12px] leading-[1.45] text-neutral-600 dark:text-neutral-400">
                                {job.note}
                            </span>
                            <span className="mt-0.5 text-[11.5px] text-muted-foreground">
                                Adds {job.gives}
                            </span>
                            {needsNote ? (
                                <span className="text-pretty text-[11.5px] leading-[1.45] text-brand-subtle-foreground">
                                    {needsNote}
                                </span>
                            ) : null}
                        </button>
                    );
                })}
            </div>

            <p className="mt-4 text-[12.5px] text-muted-foreground">
                Other capabilities build on these.{" "}
                <Link
                    href="/onboarding/modules"
                    className="font-medium text-brand underline-offset-4 hover:underline"
                >
                    See everything, or pick several at once
                </Link>
            </p>
        </section>
    );
}
