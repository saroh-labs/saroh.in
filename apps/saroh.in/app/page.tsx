import { cn } from "@saroh/ui/lib/utils";
import Image from "next/image";
import Link from "next/link";

import { ChainExplorer } from "@/components/home/chain-explorer";
import { JobRail } from "@/components/home/job-rail";
import {
    Pill,
    SecondaryButton,
    WaitlistButton,
    band,
    sectionHeading,
} from "@/components/site/bits";
import { ClosingCta } from "@/components/site/closing-cta";
import { bestShot, inPublic } from "@/lib/shots";
import { CHAINS, HOME_SHOT, JOBS, LIMITS } from "@/lib/site-content";

/**
 * Home, after "Saroh Marketing Site": the promise, what "in one place" buys a
 * clinic and a bakery, the five jobs, and what Saroh will not do — before
 * anyone has to ask.
 */
export default function Home() {
    const hero = inPublic(HOME_SHOT.full.src) ? HOME_SHOT.full : null;
    const chains = CHAINS.map((chain) => ({
        ...chain,
        image: bestShot(chain.shot),
    }));
    const rail = JOBS.map((job) => ({
        key: job.key,
        name: job.name,
        icon: job.icon,
        route: job.route,
        head: job.head,
        lede: job.lede,
        image: job.shot ? { ...job.shot.crop, alt: job.shot.alt } : undefined,
    }));

    return (
        <>
            <section className="mx-auto max-w-[1220px] px-4 pb-[46px] pt-[60px] sm:px-10">
                <div className="max-w-[60ch]">
                    <h1 className="sa-rise mb-[18px] font-display text-[30px] font-semibold leading-none tracking-[-0.045em] min-[421px]:text-[38px] md:text-[55px]">
                        One business, not four logins.
                    </h1>
                    <p className="sa-rise mb-[26px] max-w-[42ch] text-pretty text-[18px] leading-[1.55] text-neutral-600 [animation-delay:120ms] dark:text-neutral-400">
                        Your website, your shop, your diary and the people who
                        get in touch — in one workspace, under one account.
                    </p>
                    <div className="sa-rise flex flex-wrap items-center gap-[11px] [animation-delay:200ms]">
                        <WaitlistButton />
                        <SecondaryButton href="/how-it-works">
                            See how it fits together
                        </SecondaryButton>
                    </div>
                    <p className="mt-[15px] text-[12px] text-muted-foreground">
                        We are letting businesses in a few at a time.
                    </p>
                </div>
                {hero ? (
                    <figure className="mt-[38px]">
                        <div className="sa-rise overflow-hidden rounded-[16px] border border-border bg-background shadow-[0_18px_44px_rgba(28,28,26,0.10)] [animation-delay:300ms]">
                            <Image
                                src={hero.src}
                                width={hero.w}
                                height={hero.h}
                                alt={HOME_SHOT.alt}
                                priority
                                sizes="(min-width: 1220px) 1140px, 100vw"
                                className="block h-auto w-full"
                            />
                        </div>
                        <figcaption className="mt-2.5 text-pretty text-[13px] leading-[1.55] text-muted-foreground">
                            An example: the first screen of a bakery that sells
                            at a counter and online. Work named as work, not
                            counts on a dial.
                        </figcaption>
                    </figure>
                ) : null}
            </section>

            <section className="mx-auto max-w-[1220px] px-4 pb-[54px] pt-2.5 sm:px-10">
                <ChainExplorer chains={chains} />
            </section>

            <section
                aria-labelledby="jobs-heading"
                className={cn(
                    band,
                    "mx-auto mb-1 max-w-[1220px] px-4 pb-[58px] pt-[54px] sm:px-10",
                )}
            >
                <div className="mb-[26px] grid items-start gap-4 md:grid-cols-[1.1fr_1fr] md:gap-[38px]">
                    <h2
                        id="jobs-heading"
                        className={cn(sectionHeading, "text-pretty")}
                    >
                        Switch on what you do. The rest never appears.
                    </h2>
                    <p className="mt-1 text-pretty text-[15px] leading-[1.65] text-neutral-600 dark:text-neutral-400">
                        Five jobs, readable at once down the left. Nothing is
                        greyed out or behind an upgrade — a job you have not
                        switched on is simply absent.
                    </p>
                </div>
                <JobRail jobs={rail} />
            </section>

            <section className="mx-auto max-w-[1220px] px-4 pb-14 pt-2.5 sm:px-10">
                <div className="rounded-[18px] bg-brand-surface px-5 py-8 text-brand-surface-foreground sm:px-[34px]">
                    <div className="grid items-start gap-8 min-[900px]:grid-cols-2">
                        <div>
                            <h2
                                className={cn(
                                    sectionHeading,
                                    "mb-3 max-w-[26ch]",
                                )}
                            >
                                What Saroh will not do
                            </h2>
                            <p className="mb-4 max-w-[40ch] text-pretty text-[16px] leading-[1.6] text-neutral-200">
                                Better you find out here than three weeks after
                                moving your business across.
                            </p>
                            <Link
                                href="/what-it-will-not-do"
                                className="inline-flex h-[42px] items-center rounded-[9px] border border-neutral-600 px-[18px] text-[16px] font-semibold hover:bg-neutral-800"
                            >
                                Read all of them
                            </Link>
                        </div>
                        <ul className="overflow-hidden rounded-[13px] border border-neutral-600">
                            {LIMITS.slice(0, 3).map((limit) => (
                                <li
                                    key={limit.title}
                                    className="flex items-start gap-3 border-t border-neutral-600 px-4 py-3.5 first:border-t-0"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="text-pretty text-[13px] font-semibold">
                                            {limit.title}
                                        </div>
                                        <p className="mt-1 text-pretty text-[16px] leading-[1.55] text-neutral-200">
                                            {limit.body}
                                        </p>
                                    </div>
                                    <Pill tone="ink">{limit.tag}</Pill>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            <ClosingCta />
        </>
    );
}
