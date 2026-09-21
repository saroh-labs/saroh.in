import { cn } from "@saroh/ui/lib/utils";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
    Chain,
    ExampleTable,
    Pill,
    SecondaryButton,
    WaitlistButton,
    band,
    body,
    eyebrow,
    sectionHeading,
} from "@/components/site/bits";
import { ClosingCta } from "@/components/site/closing-cta";
import { JobIcon } from "@/components/site/job-icon";
import { bestShot } from "@/lib/shots";
import { JOBS, jobByKey } from "@/lib/site-content";

/**
 * The five job pages — ONE template and five data sets, as the design asks,
 * so no page can drift from the others. Each answers the same questions:
 * what it does, who it is for, how it connects, what it will not do, what the
 * screen looks like, and which jobs it works with.
 */
export const dynamicParams = false;

export function generateStaticParams() {
    return JOBS.map((job) => ({ job: job.key }));
}

interface Props {
    params: Promise<{ job: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const job = jobByKey((await params).job);
    if (!job) return {};
    return {
        title: `${job.name} — Saroh`,
        description: job.lede,
        openGraph: { title: `${job.name} — Saroh`, description: job.lede },
    };
}

export default async function JobPage({ params }: Props) {
    const job = jobByKey((await params).job);
    if (!job) notFound();
    const image = job.shot ? bestShot(job.shot) : null;
    const related = job.related
        .map((key) => jobByKey(key))
        .filter((r) => r !== undefined);

    return (
        <>
            <section className="mx-auto max-w-[1220px] px-4 pb-10 pt-[52px] sm:px-10">
                <div className="mb-[18px] flex flex-wrap items-center gap-[9px]">
                    <span className={eyebrow}>One of five jobs</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                        {job.route}
                    </span>
                </div>
                <div className="max-w-[62ch]">
                    <h1 className="mb-4 font-display text-[30px] font-semibold leading-[1.03] tracking-[-0.04em] min-[421px]:text-[38px] md:text-[48px]">
                        {job.head}
                    </h1>
                    <p className="mb-3.5 max-w-[52ch] text-pretty text-[18px] leading-[1.6] text-neutral-600 dark:text-neutral-400">
                        {job.lede}
                    </p>
                    <p className="mb-6 max-w-[52ch] text-pretty text-[16px] leading-[1.6] text-muted-foreground">
                        <strong className="font-semibold text-neutral-600 dark:text-neutral-300">
                            Who it is for:
                        </strong>{" "}
                        {job.who}
                    </p>
                    <div className="flex flex-wrap gap-[11px]">
                        <WaitlistButton className="h-[46px]" />
                        <SecondaryButton
                            href="/how-it-works"
                            className="h-[46px]"
                        >
                            How it fits together
                        </SecondaryButton>
                    </div>
                </div>

                <div className="mt-9">
                    {image && job.shot ? (
                        <figure className="overflow-hidden rounded-[16px] border border-border bg-background shadow-[0_22px_50px_rgba(28,28,26,0.14)]">
                            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5">
                                <span className="text-[12px] text-muted-foreground">
                                    {job.crumb}
                                </span>
                                <Pill tone="off" className="ml-auto">
                                    Example
                                </Pill>
                            </div>
                            <Image
                                src={image.src}
                                width={image.w}
                                height={image.h}
                                alt={job.shot.alt}
                                priority
                                sizes="(min-width: 1220px) 1140px, 100vw"
                                className="block h-auto w-full"
                            />
                        </figure>
                    ) : (
                        <ExampleTable
                            crumb={job.crumb}
                            route={job.route}
                            {...job.example}
                        />
                    )}
                    <p className="mt-2.5 text-pretty text-[13px] leading-[1.55] text-muted-foreground">
                        {job.caption}
                    </p>
                </div>
            </section>

            <section
                className={cn(
                    band,
                    "mx-auto mb-1 max-w-[1220px] px-4 pb-[58px] pt-[54px] sm:px-10",
                )}
            >
                <h2 className={cn(sectionHeading, "mb-[22px]")}>
                    What it does
                </h2>
                <div className="grid grid-cols-1 gap-[15px] md:grid-cols-[repeat(auto-fit,minmax(270px,1fr))]">
                    {job.does.map((d) => (
                        <div
                            key={d.title}
                            className="rounded-[13px] border border-border bg-card px-[21px] py-[19px]"
                        >
                            <h3 className="mb-[7px] text-pretty text-[16px] font-semibold">
                                {d.title}
                            </h3>
                            <p className={body}>{d.body}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mx-auto max-w-[1220px] px-4 pb-12 pt-[52px] sm:px-10">
                <div className="grid items-start gap-[26px] min-[900px]:grid-cols-2">
                    <div className="rounded-[15px] border border-border bg-card px-6 py-[22px]">
                        <h2 className="mb-3 font-display text-[22px] font-semibold leading-[1.15] tracking-[-0.03em]">
                            How it connects
                        </h2>
                        <Chain steps={job.flow} className="mb-[13px]" />
                        <p className={body}>{job.flowNote}</p>
                        {job.needs ? (
                            <p className="mt-4 text-pretty rounded-[11px] bg-brand-subtle px-[15px] py-[13px] text-[13px] leading-[1.55] text-brand-subtle-foreground">
                                {job.needs}
                            </p>
                        ) : null}
                    </div>
                    <div className="rounded-[15px] border border-border bg-card px-6 py-[22px]">
                        <h2 className="mb-3 font-display text-[22px] font-semibold leading-[1.15] tracking-[-0.03em]">
                            What it will not do
                        </h2>
                        <ul className="flex flex-col gap-3">
                            {job.limits.map((limit) => (
                                <li
                                    key={limit.title}
                                    className="flex flex-col items-start gap-1.5 sm:flex-row sm:gap-[11px]"
                                >
                                    <Pill tone="off">{limit.tag}</Pill>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="mb-[3px] text-pretty text-[13px] font-semibold">
                                            {limit.title}
                                        </h3>
                                        <p className={body}>{limit.body}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <Link
                            href="/what-it-will-not-do"
                            className="mt-4 inline-block text-[13px] font-medium text-brand underline underline-offset-[3px]"
                        >
                            Everything Saroh will not do
                        </Link>
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-[1220px] px-4 pb-[54px] sm:px-10">
                <h2 className={cn(eyebrow, "mb-[13px]")}>
                    Works with these {related.length}
                </h2>
                <div className="grid grid-cols-1 gap-[13px] md:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
                    {related.map((r) => (
                        <Link
                            key={r.key}
                            href={r.route}
                            className="rounded-[13px] border border-border bg-card px-[18px] py-4 transition-colors hover:bg-muted"
                        >
                            <span className="mb-1.5 flex items-center gap-[9px]">
                                <JobIcon
                                    name={r.icon}
                                    className="size-[17px] text-brand"
                                />
                                <span className="font-display text-[16px] font-semibold tracking-[-0.02em]">
                                    {r.name}
                                </span>
                            </span>
                            <span className="block text-pretty text-[12px] leading-normal text-neutral-600 dark:text-neutral-400">
                                {r.short}
                            </span>
                        </Link>
                    ))}
                </div>
            </section>

            <ClosingCta />
        </>
    );
}
