"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { cn } from "@saroh/ui/lib/utils";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

import { Pill } from "@/components/subscriptions/pill";
import type { Tab, TabKey, Tag } from "@/lib/customer-workspace/view";

const HEAD_BTN =
    "h-8 rounded-[9px] px-3 text-[12.5px] font-semibold coarse:h-11";

/** "Sell › Customers › Priya Raman", or "Contacts › …" where nothing is sold. */
export function Crumbs({ here, sells }: { here: string; sells: boolean }) {
    return (
        <nav
            aria-label="Breadcrumb"
            className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground"
        >
            {sells ? (
                <>
                    <span>Sell</span>
                    <span aria-hidden>›</span>
                    <Link
                        href="/commerce/customers"
                        className="text-muted-foreground hover:text-foreground"
                    >
                        Customers
                    </Link>
                </>
            ) : (
                <Link
                    href="/contacts"
                    className="text-muted-foreground hover:text-foreground"
                >
                    Contacts
                </Link>
            )}
            <span aria-hidden>›</span>
            <span aria-current="page" className="text-foreground">
                {here}
            </span>
        </nav>
    );
}

/**
 * Who they are: initials, name and its word (Returning, Member), since when,
 * and how to reach them — then Edit details and More, which are for owners
 * and admins. A Member reads the page and is told what is not theirs.
 */
export function Header({
    name,
    initials,
    tag,
    since,
    email,
    phone,
    canEdit,
    onEdit,
    menu,
}: {
    name: string;
    initials: string;
    tag: Tag | null;
    since: string;
    email: string;
    phone: string | null;
    canEdit: boolean;
    onEdit: () => void;
    /** What More holds; empty hides it. */
    menu: { label: string; danger?: boolean; go: () => void }[];
}) {
    return (
        <>
            <div className="mb-3.5 flex flex-wrap items-center gap-3.5">
                <div
                    aria-hidden
                    className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-brand-subtle font-display text-[18px] font-semibold text-brand-subtle-foreground"
                >
                    {initials}
                </div>
                <div className="min-w-0 flex-[1_1_260px]">
                    <div className="flex flex-wrap items-center gap-[9px]">
                        <h1 className="m-0 font-display text-[26px] font-semibold leading-[1.15] tracking-[-0.03em]">
                            {name}
                        </h1>
                        {tag ? <Pill tone={tag.tone}>{tag.label}</Pill> : null}
                    </div>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                        {since}
                    </p>
                    {canEdit ? (
                        <div className="mt-[5px] flex flex-wrap gap-3.5 text-[13px]">
                            <a
                                href={`mailto:${email}`}
                                className="text-brand hover:text-foreground"
                            >
                                {email}
                            </a>
                            <span className="text-foreground/75">
                                {phone?.trim() ? phone : "No phone"}
                            </span>
                        </div>
                    ) : (
                        <div className="mt-[5px] flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                            <Lock
                                aria-hidden
                                className="size-[13px] shrink-0"
                            />
                            Contact details are visible to owners and admins.
                            Ask an owner if you need them.
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        className={HEAD_BTN}
                        disabled={!canEdit}
                        title={canEdit ? undefined : "Owners and admins only"}
                        onClick={onEdit}
                    >
                        Edit details
                    </Button>
                    {menu.length ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={HEAD_BTN}
                                    disabled={!canEdit}
                                    title={
                                        canEdit
                                            ? undefined
                                            : "Owners and admins only"
                                    }
                                >
                                    More
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="w-[220px] p-[5px]"
                            >
                                {menu.map((m) => (
                                    <DropdownMenuItem
                                        key={m.label}
                                        onSelect={m.go}
                                        className={cn(
                                            "rounded-[7px] px-2.5 py-2 text-[13px]",
                                            m.danger &&
                                                "text-destructive-subtle-foreground focus:bg-destructive-subtle focus:text-destructive-subtle-foreground",
                                        )}
                                    >
                                        {m.label}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null}
                </div>
            </div>
            {!canEdit ? (
                <p className="-mt-1.5 mb-3 text-[12px] text-muted-foreground">
                    You can read this customer and their notes; editing, linking
                    and removing are for owners and admins.
                </p>
            ) : null}
        </>
    );
}

/**
 * The section tabs, by business kind. Arrow keys move between them, as the
 * design's tablist does; each tab says how many rows sit behind it.
 */
export function Tabs({
    tabs,
    value,
    onChange,
}: {
    tabs: Tab[];
    value: TabKey;
    onChange: (key: TabKey) => void;
}) {
    const list = useRef<HTMLDivElement>(null);
    const keys = (e: React.KeyboardEvent) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const i = tabs.findIndex((t) => t.key === value);
        const n =
            (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
        onChange(tabs[n].key);
        const buttons =
            list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        buttons?.item(n).focus();
    };
    return (
        <div
            ref={list}
            role="tablist"
            aria-label="Customer sections"
            onKeyDown={keys}
            className="flex flex-wrap gap-0.5 border-b border-border"
        >
            {tabs.map((t) => {
                const on = t.key === value;
                return (
                    <button
                        key={t.key}
                        id={`tab-${t.key}`}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        aria-controls={`panel-${t.key}`}
                        tabIndex={on ? 0 : -1}
                        onClick={() => onChange(t.key)}
                        className={cn(
                            "inline-flex items-center px-3.5 py-2.5 text-[13px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
                            on
                                ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--brand))]"
                                : "font-medium text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {t.label}
                        {t.count ? (
                            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[11px] font-semibold text-muted-foreground">
                                {t.count}
                            </span>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
}
