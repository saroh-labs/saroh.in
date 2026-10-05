"use client";

import { ShareCard } from "@saroh/ui/share-card";

import { linkPreview as copy } from "@/content/link-preview";
import { cn } from "@/lib/cn";
import type { CheckResult, TagRow } from "@/lib/link-preview";
import { APP_NAMES, cardImage, cardText, EXTRA_APPS } from "@/lib/link-preview";

type Checked = Extract<CheckResult, { ok: true }>;

const MARK: Record<
    TagRow["mark"],
    { sign: string; label: string; tone: string }
> = {
    ok: { sign: "✓", label: "Set", tone: "text-mk-good" },
    missing: { sign: "✗", label: "Missing", tone: "text-mk-bad" },
    warn: { sign: "!", label: "Needs a look", tone: "text-brand-700" },
};

/** The white panel: the score line, the domain, and each tag as found. */
export function ScorePanel({ result }: { result: Checked }) {
    return (
        <div className="grid gap-3.5 rounded-2xl border border-border bg-card p-5">
            <span className="grid gap-0.5">
                <span className="font-semibold" data-testid="score-line">
                    {result.score}
                </span>
                <span className="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
                    {result.facts.domain}
                </span>
            </span>
            <ul className="m-0 grid list-none p-0">
                {result.tags.map((row) => {
                    const mark = MARK[row.mark];
                    return (
                        <li
                            key={row.tag}
                            className="grid grid-cols-[20px_minmax(0,120px)_minmax(0,1fr)] gap-2 border-t border-muted py-[9px] text-[13.5px] max-[360px]:grid-cols-[20px_minmax(0,1fr)]"
                        >
                            <span
                                aria-hidden
                                className={cn("font-bold", mark.tone)}
                            >
                                {mark.sign}
                            </span>
                            <span className="font-mono text-xs leading-[1.6] [overflow-wrap:anywhere]">
                                <span className="sr-only">{mark.label}: </span>
                                {row.tag}
                            </span>
                            <span className="leading-[1.4] text-mk-copy [overflow-wrap:anywhere] max-[360px]:col-start-2">
                                {row.note}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** The six free cards, each with its verdict, and the four the email unlocks. */
export function CardsGrid({
    result,
    unlocked,
}: {
    result: Checked;
    unlocked: boolean;
}) {
    const { facts } = result;
    const image = cardImage(facts, result.sample === true);
    return (
        <div className="grid min-w-0 gap-4">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4">
                {result.apps.map(({ app, ok }) => (
                    <section
                        key={app}
                        aria-label={`${APP_NAMES[app]}: ${ok ? copy.looksRight : copy.needsFix}`}
                        className="grid min-w-0 content-start gap-3 rounded-2xl border border-border bg-card p-4"
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-[14.5px] font-semibold">
                                {APP_NAMES[app]}
                            </span>
                            <span
                                className={cn(
                                    "ml-auto rounded-full px-[9px] py-[3px] text-xs font-semibold",
                                    ok
                                        ? "bg-mk-good-bg text-mk-good"
                                        : "bg-mk-bad-bg text-mk-bad",
                                )}
                            >
                                {ok ? copy.looksRight : copy.needsFix}
                            </span>
                        </div>
                        <ShareCard
                            platform={app}
                            {...cardText(facts, app)}
                            domain={facts.domain}
                            image={image}
                        />
                    </section>
                ))}
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3">
                {EXTRA_APPS.map((name) => (
                    <section
                        key={name}
                        aria-label={unlocked ? name : `${name}, ${copy.locked}`}
                        className={cn(
                            "grid min-w-0 gap-2 rounded-[14px] border border-border bg-card p-3 transition-opacity duration-base ease-out",
                            !unlocked && "opacity-[0.45]",
                        )}
                    >
                        <span className="text-[13.5px] font-semibold">
                            {name}{" "}
                            {unlocked ? null : (
                                <span className="font-normal text-muted-foreground">
                                    · {copy.locked}
                                </span>
                            )}
                        </span>
                        <div aria-hidden={!unlocked} inert={!unlocked}>
                            <ShareCard
                                platform="small"
                                {...cardText(facts, "small")}
                                domain={facts.domain}
                                image={image}
                            />
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
