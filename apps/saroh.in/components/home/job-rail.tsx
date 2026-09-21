"use client";

import { cn } from "@saroh/ui/lib/utils";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { JobIcon } from "@/components/site/job-icon";
import type { IconName } from "@/lib/site-content";

export interface RailJob {
    key: string;
    name: string;
    icon: IconName;
    route: string;
    head: string;
    lede: string;
    /** The detail crop of this job's screen; absent where there is none. */
    image?: { src: string; w: number; h: number; alt: string };
}

/**
 * "Switch on what you do": the five jobs readable at once down the left, and
 * the chosen one's screen, headline and link on the right. Arrows step
 * through them; the position is announced.
 */
export function JobRail({ jobs }: { jobs: RailJob[] }) {
    const [index, setIndex] = useState(0);
    const job = jobs[index];
    const step = (d: number) =>
        setIndex((i) => (i + d + jobs.length) % jobs.length);
    const prev = jobs[(index - 1 + jobs.length) % jobs.length];
    const next = jobs[(index + 1) % jobs.length];

    return (
        <div className="grid gap-[18px] min-[1100px]:grid-cols-[208px_1fr] min-[1100px]:gap-[26px]">
            <div>
                <div
                    role="group"
                    aria-label="Jobs"
                    className="flex flex-row flex-wrap gap-[7px] min-[1100px]:flex-col min-[1100px]:gap-px"
                >
                    {jobs.map((j, i) => (
                        <button
                            key={j.key}
                            type="button"
                            aria-pressed={i === index}
                            onClick={() => setIndex(i)}
                            className={cn(
                                "flex items-center gap-[9px] rounded-[9px] border px-[11px] py-2 text-left text-[16px] min-[1100px]:w-full",
                                i === index
                                    ? "border-border bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(28,28,26,0.06)]"
                                    : "border-transparent font-medium text-neutral-600 hover:text-foreground dark:text-neutral-400",
                            )}
                        >
                            <span className="grid size-7 shrink-0 place-items-center">
                                <JobIcon
                                    name={j.icon}
                                    className="size-[15px]"
                                />
                            </span>
                            <span className="min-w-0 flex-1">{j.name}</span>
                        </button>
                    ))}
                </div>
                <div className="mt-5 flex gap-[7px]">
                    <button
                        type="button"
                        onClick={() => step(-1)}
                        aria-label={`Previous job — ${prev.name}`}
                        className="grid size-[30px] place-items-center rounded-full border border-border bg-card text-neutral-600 hover:bg-muted dark:text-neutral-400"
                    >
                        <ChevronLeft aria-hidden className="size-[15px]" />
                    </button>
                    <button
                        type="button"
                        onClick={() => step(1)}
                        aria-label={`Next job — ${next.name}`}
                        className="grid size-[30px] place-items-center rounded-full border border-border bg-card text-neutral-600 hover:bg-muted dark:text-neutral-400"
                    >
                        <ChevronRight aria-hidden className="size-[15px]" />
                    </button>
                    <span
                        role="status"
                        aria-live="polite"
                        className="ml-1 self-center font-mono text-[11.5px] text-muted-foreground"
                    >
                        {index + 1} / {jobs.length}
                    </span>
                </div>
            </div>

            <div className="relative overflow-hidden rounded-[16px] border border-border bg-card pb-5 pl-5 pt-[22px] sm:pl-[22px]">
                <Link
                    href={job.route}
                    aria-label={`Open the ${job.name} page`}
                    className="absolute right-3.5 top-3.5 z-10 grid size-[30px] place-items-center rounded-full border border-border bg-card text-neutral-600 hover:bg-muted dark:text-neutral-400"
                >
                    <ArrowUpRight aria-hidden className="size-[13px]" />
                </Link>
                {job.image ? (
                    // The well is as tall as the crop, so no crop leaves dead
                    // space; wider than the card, it scrolls sideways.
                    <div
                        className="overflow-x-auto overflow-y-hidden"
                        style={{ maxWidth: job.image.w }}
                    >
                        <Image
                            key={job.image.src}
                            src={job.image.src}
                            width={job.image.w}
                            height={job.image.h}
                            alt={job.image.alt}
                            className="block max-w-none rounded-tl-[10px] shadow-[0_10px_30px_rgba(28,28,26,0.16)]"
                        />
                    </div>
                ) : (
                    <div className="mr-[22px] rounded-[10px] border border-dashed border-border bg-card px-[26px] py-10">
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                            No capture yet
                        </div>
                        <p className="max-w-[46ch] text-pretty text-[14px] leading-[1.6] text-neutral-600 dark:text-neutral-400">
                            The website editor has no capture yet, so this panel
                            says so rather than borrowing another job's screen.
                        </p>
                    </div>
                )}
                <div className="pr-[22px] pt-5">
                    <div className="font-display text-[19px] font-semibold tracking-[-0.025em]">
                        {job.head}
                    </div>
                    <p className="mt-[5px] max-w-[62ch] text-pretty text-[15px] leading-[1.6] text-neutral-600 dark:text-neutral-400">
                        {job.lede}
                    </p>
                    <Link
                        href={job.route}
                        className="mt-[13px] inline-flex h-9 items-center rounded-[9px] border border-border bg-card px-3.5 text-[13.5px] font-semibold hover:bg-muted"
                    >
                        What {job.name} does →
                    </Link>
                </div>
            </div>
        </div>
    );
}
