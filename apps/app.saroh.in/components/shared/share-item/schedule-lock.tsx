"use client";

import { planLabel } from "@saroh/ui/lib/state-copy";
import { cn } from "@saroh/ui/lib/utils";
import { TextLink } from "@saroh/ui/text-link";
import { AtSign, BarChart3, Flag, Instagram, Lock } from "lucide-react";
import { useId } from "react";

import { PlanWay } from "@/components/billing/plan-way";
import { upgradeHref } from "@/lib/billing/access";
import type { ScheduleLock } from "@/lib/share-item/share";
import { ADD_ONS_HREF } from "@/lib/share-item/share";
import { addSocialLabel, SHARE_WORDS } from "@/lib/share-item/words";

/**
 * Saroh Social, drawn locked (boards SBShare*, BPost*, BDone*): it isn't
 * built, so no business has it. Free is pointed at the plans, Grow at the
 * add-on, its price only from the catalogue. Someone who can't change the
 * plan reads who can (`PlanWay`); while plans aren't shown, no link at all.
 * Share now never waits on it.
 */

const wayHref = (lock: ScheduleLock) =>
    lock.tier === "grow" ? ADD_ONS_HREF : upgradeHref();
const wayLabel = (lock: ScheduleLock) =>
    lock.tier === "grow" ? addSocialLabel(lock.price) : planLabel();

/** The way to Saroh Social, as a link after a sentence. */
function Way({ lock }: { lock: ScheduleLock }) {
    return (
        <PlanWay
            fallback={
                lock.tier === "grow" ? (
                    <span className="block">{SHARE_WORDS.ownerCanAdd}</span>
                ) : null
            }
        >
            <TextLink
                href={wayHref(lock)}
                className="whitespace-nowrap font-semibold"
                data-social-way={lock.tier}
            >
                {wayLabel(lock)}
            </TextLink>
        </PlanWay>
    );
}

/** One quiet line: what Saroh Social adds, and the way to it. */
export function SocialLine({
    lock,
    words = SHARE_WORDS.postStraight,
    icon = "lock",
    className,
}: {
    lock: ScheduleLock;
    words?: string;
    icon?: "lock" | "chart";
    className?: string;
}) {
    const Icon = icon === "chart" ? BarChart3 : Lock;
    return (
        <p
            data-social-line={lock.tier}
            className={cn(
                "text-pretty text-[12.5px] leading-[1.5] text-muted-foreground",
                className,
            )}
        >
            <Icon aria-hidden className="mr-1.5 inline size-3.5 align-[-2px]" />
            {words} <Way lock={lock} />
        </p>
    );
}

/** After sharing (BDone*, SPayoff*): the dashed "next time" note. */
export function SocialTease({ lock }: { lock: ScheduleLock }) {
    return (
        <div
            data-social-tease={lock.tier}
            className="flex items-start gap-3 rounded-xl border border-dashed border-border-strong bg-card p-3.5 text-[13.5px] leading-[1.5] text-muted-foreground"
        >
            <BarChart3 aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 text-pretty">
                <b className="font-semibold text-foreground">
                    {SHARE_WORDS.skipCopy}
                </b>{" "}
                {SHARE_WORDS.skipCopyWhat} <Way lock={lock} />
            </p>
        </div>
    );
}

const CHANNELS = [
    { name: "Instagram", icon: Instagram },
    { name: "Facebook Page", icon: Flag },
    { name: "Threads", icon: AtSign },
] as const;

/**
 * "Post to" (BPostDesk): the channels Saroh Social posts to, each locked,
 * and the one way to it.
 */
export function PostToLocked({ lock }: { lock: ScheduleLock }) {
    const id = useId();
    return (
        <section
            data-channels-locked={lock.tier}
            aria-labelledby={id}
            className="grid gap-1 rounded-xl border border-border bg-card px-4 py-3.5"
        >
            <h3 id={id} className="mb-1.5 text-[14.5px] font-semibold">
                {SHARE_WORDS.postTo}
            </h3>
            <ul className="grid">
                {CHANNELS.map(({ name, icon: Icon }) => (
                    <li
                        key={name}
                        className="flex min-h-11 items-center gap-2.5 text-[13.5px] font-semibold text-muted-foreground"
                    >
                        <span className="flex size-8 items-center justify-center rounded-[9px] bg-muted text-foreground">
                            <Icon aria-hidden className="size-4" />
                        </span>
                        <span className="flex-1">{name}</span>
                        <Lock aria-label="Locked" className="size-3.5" />
                    </li>
                ))}
            </ul>
            <SocialLine lock={lock} className="mt-2" />
        </section>
    );
}
