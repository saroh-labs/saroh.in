"use client";

import { Button } from "@saroh/ui/button";
import { planLabel } from "@saroh/ui/lib/state-copy";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { TextLink } from "@saroh/ui/text-link";
import { ChevronDown, Lock } from "lucide-react";
import Link from "next/link";
import { forwardRef } from "react";

import { PlanWay } from "@/components/billing/plan-way";
import { upgradeHref } from "@/lib/billing/access";
import type { ScheduleLock } from "@/lib/share-item/share";
import { ADD_ONS_HREF } from "@/lib/share-item/share";
import { addSocialLabel, SHARE_WORDS } from "@/lib/share-item/words";

/**
 * Schedule, drawn locked (SFLock*): Saroh Social isn't built, so no
 * business has it. Free is pointed at the plans, Grow at the add-on, its
 * price only from the catalogue. Someone who can't change the plan reads
 * who can (`PlanWay`); while plans aren't shown, no link at all.
 */

const wayHref = (lock: ScheduleLock) =>
    lock.tier === "grow" ? ADD_ONS_HREF : upgradeHref();
const wayLabel = (lock: ScheduleLock) =>
    lock.tier === "grow" ? addSocialLabel(lock.price) : planLabel();

/** The locked Schedule, drawn as the boards' split button. */
export const ScheduleButton = forwardRef<
    HTMLButtonElement,
    React.ComponentPropsWithoutRef<"button">
>(function ScheduleButton({ className, ...props }, ref) {
    return (
        <Button
            ref={ref}
            type="button"
            variant="outline"
            className={cn("h-11 gap-0 bg-card p-0 sm:h-9", className)}
            aria-label={`${SHARE_WORDS.schedule}, locked`}
            {...props}
        >
            <span className="flex items-center gap-2 px-3.5 font-semibold">
                <Lock aria-hidden className="size-3.5" />
                {SHARE_WORDS.schedule}
            </span>
            <span
                aria-hidden
                className="flex h-full items-center border-l border-border px-2.5"
            >
                <ChevronDown className="size-4" />
            </span>
        </Button>
    );
});

/** The quiet line by the foot: what Schedule needs, and the way to it. */
export function ScheduleLine({
    lock,
    phone = false,
}: {
    lock: ScheduleLock;
    phone?: boolean;
}) {
    return (
        <p
            className={cn(
                "text-pretty text-[12.5px] leading-[1.5] text-muted-foreground",
                phone && "text-center",
            )}
        >
            <Lock aria-hidden className="mr-1 inline size-3 align-[-1px]" />
            {phone
                ? SHARE_WORDS.scheduleLinePhone
                : SHARE_WORDS.scheduleLine}{" "}
            <PlanWay fallback={null}>
                <TextLink href={wayHref(lock)} className="font-semibold">
                    {wayLabel(lock)}
                </TextLink>
            </PlanWay>
        </p>
    );
}

/** What Saroh Social would add, and the way to it (SFLockFree, SFLockGrow). */
export function SocialOffer({
    lock,
    onClose,
    className,
}: {
    lock: ScheduleLock;
    onClose: () => void;
    className?: string;
}) {
    const grow = lock.tier === "grow";
    return (
        <div
            data-social-offer={lock.tier}
            className={cn("grid gap-2", className)}
        >
            <p className="flex items-center gap-2 text-[15px] font-semibold">
                <Lock aria-hidden className="size-4" />
                {grow ? SHARE_WORDS.growTitle : SHARE_WORDS.freeTitle}
            </p>
            <p className="text-pretty text-[13.5px] leading-[1.5] text-muted-foreground">
                {SHARE_WORDS.socialWhat}
            </p>
            <PlanWay fallback={null}>
                <p className="text-pretty text-[13.5px] leading-[1.5] text-muted-foreground">
                    {grow ? SHARE_WORDS.growBilled : SHARE_WORDS.freeComes}
                </p>
            </PlanWay>
            <div className="mt-1 flex flex-wrap items-center gap-2">
                <PlanWay
                    // Free: PlanWay's own line, who can change the plan.
                    fallback={
                        grow ? (
                            <p className="w-full text-[13px] text-muted-foreground">
                                {SHARE_WORDS.ownerCanAdd}
                            </p>
                        ) : undefined
                    }
                >
                    <Button asChild size="sm">
                        <Link href={wayHref(lock)}>{wayLabel(lock)}</Link>
                    </Button>
                </PlanWay>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onClose}
                >
                    {SHARE_WORDS.notNow}
                </Button>
            </div>
            <p className="text-[13px] text-muted-foreground">
                {SHARE_WORDS.stillFree}
            </p>
        </div>
    );
}

/** At a desk: the locked Schedule opens the offer in a small popover. */
export function DeskSchedule({
    lock,
    open,
    onOpenChange,
}: {
    lock: ScheduleLock;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <ScheduleButton />
            </PopoverTrigger>
            <PopoverContent
                align="end"
                side="top"
                role="dialog"
                aria-label={
                    lock.tier === "grow"
                        ? SHARE_WORDS.growTitle
                        : SHARE_WORDS.freeTitle
                }
                className="w-[340px] max-w-[calc(100vw-2rem)] rounded-xl"
            >
                <SocialOffer lock={lock} onClose={() => onOpenChange(false)} />
            </PopoverContent>
        </Popover>
    );
}

/**
 * Channels, locked (SFCLocked*, SGOwn*): what Saroh Social adds to Create
 * post, and the one way to it. The page says the offer here, once; its
 * foot then only names Schedule.
 */
export function ChannelsLocked({
    lock,
    title,
    what,
}: {
    lock: ScheduleLock;
    title: string;
    what: string;
}) {
    return (
        <section
            data-channels-locked={lock.tier}
            aria-label={title}
            className="grid gap-3 rounded-xl border border-border bg-card p-4"
        >
            <h2 className="flex items-center gap-2 text-[14px] font-semibold">
                {title}
                <span className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground">
                    <Lock aria-hidden className="size-3" />
                    Saroh Social
                </span>
            </h2>
            <div aria-hidden className="flex gap-1.5">
                {["IG", "f", "@"].map((mark) => (
                    <span
                        key={mark}
                        className="flex size-8 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground"
                    >
                        {mark}
                    </span>
                ))}
            </div>
            <p className="text-pretty text-[13.5px] leading-[1.5] text-muted-foreground">
                {what}
            </p>
            <PlanWay
                fallback={
                    lock.tier === "grow" ? (
                        <p className="text-[13px] text-muted-foreground">
                            {SHARE_WORDS.ownerCanAdd}
                        </p>
                    ) : undefined
                }
            >
                <div>
                    <Button asChild size="sm">
                        <Link href={wayHref(lock)}>{wayLabel(lock)}</Link>
                    </Button>
                </div>
            </PlanWay>
        </section>
    );
}
