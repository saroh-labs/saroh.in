"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useEffect, useRef, useState } from "react";

import { Chain, body, eyebrow, sectionHeading } from "@/components/site/bits";
import { ThemedImage } from "@/components/site/themed-image";
import type { Chain as ChainData } from "@/lib/site-content";

/**
 * "What 'in one place' actually buys you": pick a business, and its path from
 * being found to being counted arrives step by step.
 *
 * The motion IS the explanation, so the steps arrive in order — 70ms apart,
 * slow enough to read as a sequence. It never hides content: the reveal waits
 * for the section to scroll in, shows at once if it is already on screen, and
 * falls back to showing after 2.5s if the observation never happens.
 */
export function ChainExplorer({ chains }: { chains: ChainData[] }) {
    const [key, setKey] = useState(chains[0].key);
    const [shown, setShown] = useState(false);
    const section = useRef<HTMLDivElement>(null);
    const chain = chains.find((c) => c.key === key) ?? chains[0];

    useEffect(() => {
        const el = section.current;
        const show = () => setShown(true);
        if (
            !el ||
            typeof IntersectionObserver !== "function" ||
            el.getBoundingClientRect().top < window.innerHeight
        ) {
            show();
            return;
        }
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    io.disconnect();
                    show();
                }
            },
            { threshold: 0.15 },
        );
        io.observe(el);
        const floor = window.setTimeout(show, 2500);
        return () => {
            io.disconnect();
            window.clearTimeout(floor);
        };
    }, []);

    const pick = (next: string) => {
        if (next === key) return;
        // Replay the arrival for the new business: hide, then show on the
        // frame after the new steps have rendered.
        setShown(false);
        setKey(next);
        requestAnimationFrame(() =>
            requestAnimationFrame(() => setShown(true)),
        );
    };

    return (
        <div
            ref={section}
            className="overflow-hidden rounded-[18px] border border-border bg-card"
        >
            <div className="px-5 pb-[18px] pt-[26px] sm:px-7">
                <h2 className={cn(sectionHeading, "mb-2.5 max-w-[34ch]")}>
                    What “in one place” actually buys you
                </h2>
                <p className={cn(body, "mb-[18px] max-w-[54ch]")}>
                    The same work, the whole way through. Nothing gets copied
                    between tools.
                </p>
                <div
                    role="group"
                    aria-label="Choose a business"
                    className="flex flex-wrap gap-[7px]"
                >
                    {chains.map((c) => (
                        <button
                            key={c.key}
                            type="button"
                            aria-pressed={c.key === key}
                            onClick={() => pick(c.key)}
                            className={cn(
                                "h-[34px] rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                                c.key === key
                                    ? "border-foreground bg-foreground font-semibold text-background"
                                    : "border-border bg-card text-neutral-600 hover:bg-muted dark:text-neutral-400",
                            )}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="px-5 pb-[22px] pt-1 sm:px-7">
                <Chain
                    detail
                    steps={chain.steps}
                    stepClassName={() =>
                        cn(
                            "transition-[opacity,transform] [transition-duration:420ms] ease-out motion-reduce:transform-none",
                            shown
                                ? "translate-y-0 opacity-100"
                                : "translate-y-2.5 opacity-0",
                        )
                    }
                    style={(i) => ({ transitionDelay: `${i * 70}ms` })}
                />
            </div>

            <div className="px-5 pb-5 sm:px-7">
                <div className="border-t border-border pt-[18px]">
                    <div className={cn(eyebrow, "mb-[9px]")}>
                        In {chain.whose} Saroh
                    </div>
                    <div className="overflow-hidden rounded-[14px] border border-border bg-background shadow-[0_14px_36px_rgba(28,28,26,0.10)]">
                        <ThemedImage
                            key={chain.key}
                            image={chain.shot.full}
                            alt={chain.shot.alt}
                            sizes="(min-width: 1220px) 1110px, 100vw"
                            className="h-auto w-full"
                        />
                    </div>
                    <p className="mt-2.5 max-w-[74ch] text-pretty text-[13px] leading-[1.55] text-muted-foreground">
                        {chain.notice}
                    </p>
                </div>
            </div>

            <div className="px-5 pb-6 sm:px-7">
                <div className="flex flex-wrap items-start gap-3.5 border-t border-border pt-4">
                    <div className="min-w-[240px] flex-[1_1_320px]">
                        <div className={cn(eyebrow, "mb-[7px]")}>
                            Which means
                        </div>
                        <p className="text-pretty text-[16px] leading-[1.6]">
                            {chain.means}
                        </p>
                    </div>
                    <div className="min-w-[240px] flex-[1_1_260px] rounded-[11px] bg-muted px-4 py-3.5">
                        <div className={cn(eyebrow, "mb-[7px]")}>
                            Without it
                        </div>
                        <p className={body}>{chain.without}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
