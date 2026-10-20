"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronDown, MoreHorizontal, Share2 } from "lucide-react";
import Link from "next/link";

import type {
    InvoiceAction,
    InvoiceActionId,
    InvoiceActions,
} from "@/lib/invoices/detail-actions";

/**
 * What each action does on this screen: a press, or a link. The rules
 * (`actionsFor`) say which actions a state gets; the view says what they do.
 */
export type ActionDoes = Partial<
    Record<InvoiceActionId, (action: InvoiceAction) => void>
> & { hrefs?: Partial<Record<InvoiceActionId, string>> };

/** One action as a button: the main one filled, the rest outlined. */
export function ActionButton({
    action: a,
    does,
    main = false,
    className,
    describedBy,
}: {
    action: InvoiceAction;
    does: ActionDoes;
    main?: boolean;
    className?: string;
    /** The note that says why it is off, read with it. */
    describedBy?: string;
}) {
    const href = does.hrefs?.[a.id];
    const variant = main ? "default" : "outline";
    const cls = cn(
        a.danger &&
            !main &&
            "text-destructive-subtle-foreground hover:text-destructive-subtle-foreground",
        className,
    );
    if (href && !a.disabled) {
        return (
            <Button asChild variant={variant} className={cls}>
                <Link href={href}>{a.label}</Link>
            </Button>
        );
    }
    return (
        <Button
            type="button"
            variant={variant}
            className={cls}
            disabled={a.disabled}
            aria-describedby={a.reason ? describedBy : undefined}
            data-action={a.id}
            onClick={() => does[a.id]?.(a)}
        >
            {a.label}
        </Button>
    );
}

/**
 * Share or More: a menu of actions. An action that is off stays in the
 * menu, with why under it (FB-1), so nothing seems to have gone.
 */
export function ActionMenu({
    kind,
    items,
    does,
    align = "end",
    side,
    className,
}: {
    kind: "share" | "more";
    items: InvoiceAction[];
    does: ActionDoes;
    align?: "start" | "end";
    side?: "top" | "bottom";
    className?: string;
}) {
    if (items.length === 0) return null;
    const share = kind === "share";
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant={share ? "outline" : "ghost"}
                    className={cn("gap-1.5", className)}
                    data-menu={kind}
                >
                    {share ? (
                        <Share2 aria-hidden className="size-4" />
                    ) : (
                        <MoreHorizontal aria-hidden className="size-4" />
                    )}
                    {share ? "Share" : "More"}
                    <ChevronDown
                        aria-hidden
                        className="size-3.5 text-muted-foreground"
                    />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={align} side={side} className="w-64">
                {items.map((a) => {
                    const href = does.hrefs?.[a.id];
                    const body = (
                        <span className="grid gap-0.5">
                            <span>{a.label}</span>
                            {a.disabled && a.reason ? (
                                <span className="text-[12px] leading-snug text-muted-foreground">
                                    {a.reason}
                                </span>
                            ) : null}
                        </span>
                    );
                    return href && !a.disabled ? (
                        <DropdownMenuItem
                            key={`${a.id}:${a.kind ?? ""}`}
                            asChild
                        >
                            <Link href={href}>{body}</Link>
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem
                            key={`${a.id}:${a.kind ?? ""}`}
                            disabled={a.disabled}
                            variant={a.danger ? "destructive" : "default"}
                            data-action={a.id}
                            onSelect={() => does[a.id]?.(a)}
                        >
                            {body}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/** Share, then More: the menus every state draws after its buttons. */
export function ShareAndMore({
    actions,
    does,
    align,
    side,
    className,
}: {
    actions: InvoiceActions;
    does: ActionDoes;
    align?: "start" | "end";
    side?: "top" | "bottom";
    className?: string;
}) {
    return (
        <>
            <ActionMenu
                kind="share"
                items={actions.share}
                does={does}
                align={align}
                side={side}
                className={className}
            />
            <ActionMenu
                kind="more"
                items={actions.more}
                does={does}
                align={align}
                side={side}
                className={className}
            />
        </>
    );
}
