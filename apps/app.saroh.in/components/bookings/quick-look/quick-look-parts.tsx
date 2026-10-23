"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { SheetDescription, SheetTitle } from "@saroh/ui/sheet";
import { ArrowLeft, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

/**
 * The quick look's panel pieces (U7, BKMQuickLook, BKDQuickLook): a head
 * with Back and Close, a scrolling body and a pinned foot. A bottom sheet
 * on a phone, the right-hand panel at a desk: the same pieces, spaced as
 * each board draws them.
 */

/** The design's buttons: 48px on a phone, 44px at a desk. */
export const QL_BTN =
    "h-12 rounded-[10px] px-[18px] text-[15px] font-semibold min-[760px]:h-11 min-[760px]:text-[14.5px]";

const ICON_BTN =
    "grid size-11 shrink-0 cursor-pointer place-items-center rounded-[8px] text-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent-active";

export function CloseButton({
    onClose,
    className,
}: {
    onClose: () => void;
    className?: string;
}) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={onClose}
            className={cn(ICON_BTN, className)}
        >
            <X aria-hidden className="size-[18px]" />
        </Button>
    );
}

/**
 * A step's head: Back, a quiet line over the title (desk) or under it
 * (phone), the title, and Close. The title takes the keyboard when the
 * step opens, so a screen reader hears where it is.
 */
export function StepHead({
    title,
    line,
    onBack,
    onClose,
}: {
    title: string;
    line?: string;
    onBack: () => void;
    onClose: () => void;
}) {
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        heading.current?.focus();
    }, [title]);
    return (
        <div className="relative flex shrink-0 items-center gap-1 py-2 pl-2 pr-14 min-[760px]:border-b min-[760px]:border-border min-[760px]:py-3.5 min-[760px]:pl-3">
            <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Back"
                onClick={onBack}
                className={ICON_BTN}
            >
                <ArrowLeft aria-hidden className="size-5" />
            </Button>
            <div className="flex min-w-0 flex-1 flex-col">
                {line ? (
                    <SheetDescription className="min-[760px]:label order-2 text-[12.5px] text-muted-foreground min-[760px]:order-1 min-[760px]:text-[11px]">
                        {line}
                    </SheetDescription>
                ) : null}
                <SheetTitle
                    ref={heading}
                    tabIndex={-1}
                    className="order-1 font-display text-[18px] font-semibold leading-tight tracking-[-0.02em] outline-none min-[760px]:order-2 min-[760px]:mt-1"
                >
                    {title}
                </SheetTitle>
            </div>
            <CloseButton
                onClose={onClose}
                className="absolute right-2 top-1.5 min-[760px]:right-3.5 min-[760px]:top-3.5"
            />
        </div>
    );
}

export function StepBody({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-1 min-[760px]:px-6 min-[760px]:py-5",
                className,
            )}
        >
            {children}
        </div>
    );
}

/** The pinned foot: stacked on a phone, one row at a desk. */
export function StepFoot({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "grid shrink-0 gap-2 border-t border-border/70 bg-card px-5 pb-[22px] pt-3 min-[760px]:flex min-[760px]:items-center min-[760px]:border-border min-[760px]:px-6 min-[760px]:py-4",
                className,
            )}
        >
            {children}
        </div>
    );
}

/** A row of what is known: an icon on a phone, a word at a desk. */
export function Fact({
    icon,
    label,
    children,
    aside,
}: {
    icon: ReactNode;
    label: string;
    children: ReactNode;
    aside?: ReactNode;
}) {
    return (
        <div className="flex min-h-12 items-center gap-3 border-b border-border/60 text-[14px] last:border-b-0 min-[760px]:min-h-11">
            <span className="flex w-[22px] shrink-0 text-muted-foreground min-[760px]:hidden">
                {icon}
            </span>
            <span className="hidden w-[90px] shrink-0 text-[13px] text-muted-foreground min-[760px]:inline">
                {label}
            </span>
            <span className="sr-only min-[760px]:hidden">{label}: </span>
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                {children}
            </span>
            {aside}
        </div>
    );
}

/** One quiet line of help under the facts. */
export function Help({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <p
            className={cn(
                "mt-1.5 text-pretty text-[12.5px] leading-[1.5] text-muted-foreground",
                className,
            )}
        >
            {children}
        </p>
    );
}
