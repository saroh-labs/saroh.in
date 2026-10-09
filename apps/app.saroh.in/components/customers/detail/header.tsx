"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { cn } from "@saroh/ui/lib/utils";
import { Globe, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { Pill } from "@/components/subscriptions/pill";
import type { MoreItem } from "@/lib/customer-workspace/more-menu";
import { scrollToShow } from "@/lib/customer-workspace/tab-scroll";
import type { Tab, TabKey, Tag } from "@/lib/customer-workspace/view";

const HEAD_BTN =
    "h-8 rounded-[9px] px-3 text-[12.5px] font-semibold coarse:h-11";

/** The ⋯ button: the design's 34px square beside Edit details. */
const MORE_BTN =
    "h-8 w-[34px] rounded-[9px] p-0 data-[state=open]:border-border-strong data-[state=open]:bg-accent coarse:size-11";

/** A menu row: the design's 8px by 10px, 7px corners. */
const MENU_ITEM =
    "cursor-pointer items-start rounded-[7px] px-2.5 py-2 text-[13px] active:bg-accent-active data-[disabled]:cursor-not-allowed data-[disabled]:opacity-100";

/** Why a role reads but can't act, in the design's words. */
export const EDIT_OFF =
    "Your role can't edit customers. An owner can give you access in Team.";
export const MORE_OFF = "Merging and removing need permission from an owner.";

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
 * Who they are: initials, name and its word (Returning, Member), what the
 * team must know (Needs attention's tags), since when, and how to reach
 * them — then New order and New booking for them (#247), Edit details (`contact:write`) and ⋯ More actions (edit,
 * merge or remove, each on its own permission). A role that only reads is
 * told so.
 */
export function Header({
    name,
    initials,
    tag,
    since,
    email,
    phone,
    signsIn,
    attention,
    canEdit,
    canMore = canEdit,
    onEdit,
    menu,
    starts = [],
}: {
    name: string;
    initials: string;
    tag: Tag | null;
    since: string;
    email: string;
    phone: string | null;
    /** "Signs in on your website as ‹email›" (A4); null when they don't. */
    signsIn?: string | null;
    /** Needs attention's tags, beside the name (C5). */
    attention?: React.ReactNode;
    canEdit: boolean;
    /** More opens (edit, or merge on its own permission); `canEdit` by default. */
    canMore?: boolean;
    onEdit: () => void;
    /** What More holds; empty hides it. */
    menu: MoreItem[];
    /**
     * New order, New booking (#247): each opens its flow with this person
     * already chosen. Only the ones this role may use, with their module
     * on, are passed; none draws nothing.
     */
    starts?: { label: string; href: string }[];
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
                        {/* A long name wraps, however unbroken, and the
                            tags beside it wrap under it — never off-screen. */}
                        <h1 className="m-0 min-w-0 max-w-full font-display text-[26px] font-semibold leading-[1.15] tracking-[-0.03em] [overflow-wrap:anywhere]">
                            {name}
                        </h1>
                        {tag ? (
                            <span title={tag.title} className="inline-flex">
                                <Pill tone={tag.tone}>{tag.label}</Pill>
                            </span>
                        ) : null}
                        {attention}
                    </div>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                        {since}
                    </p>
                    {/* Phone and email are part of the person: whoever
                        reads the customer (`contact:read`) sees them
                        (matrix §3). */}
                    <div className="mt-[5px] flex min-w-0 flex-wrap gap-3.5 text-[13px]">
                        {email ? (
                            // A long address wraps on a phone, whole, rather
                            // than pushing the page sideways.
                            <a
                                href={`mailto:${email}`}
                                className="min-w-0 max-w-full text-brand transition-colors [overflow-wrap:anywhere] hover:text-foreground active:text-muted-foreground"
                            >
                                {email}
                            </a>
                        ) : (
                            <span className="text-foreground/75">No email</span>
                        )}
                        <span className="text-foreground/75">
                            {phone?.trim() ? phone : "No phone"}
                        </span>
                    </div>
                    {signsIn ? (
                        <div className="mt-[5px] flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                            <Globe
                                aria-hidden
                                className="size-[13px] shrink-0"
                            />
                            {signsIn}
                        </div>
                    ) : null}
                </div>
                {/* On a phone the group drops under the name and wraps a
                    button to its own line, full size, rather than shrink. */}
                <div className="flex min-w-0 flex-wrap gap-2">
                    {starts.map((s) => (
                        <Button
                            key={s.href}
                            variant="outline"
                            className={HEAD_BTN}
                            asChild
                        >
                            <Link href={s.href}>
                                <Plus aria-hidden className="mr-1 size-3.5" />
                                {s.label}
                            </Link>
                        </Button>
                    ))}
                    <Button
                        variant="outline"
                        className={HEAD_BTN}
                        disabled={!canEdit}
                        title={canEdit ? undefined : EDIT_OFF}
                        onClick={onEdit}
                    >
                        Edit details
                    </Button>
                    {menu.length ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={MORE_BTN}
                                    disabled={!canMore}
                                    aria-label="More actions"
                                    title={canMore ? "More actions" : MORE_OFF}
                                >
                                    <MoreHorizontal
                                        aria-hidden
                                        className="size-4"
                                    />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="w-[220px] p-[5px]"
                            >
                                {menu.map((m) => (
                                    <MenuRow key={m.label} item={m} />
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null}
                </div>
            </div>
            {!canEdit ? (
                <p className="-mt-1.5 mb-3 text-[12px] text-muted-foreground">
                    Your role can see this customer but not edit them.
                </p>
            ) : null}
        </>
    );
}

/**
 * One of More's rows. One that is off stays in the menu with its reason under
 * the label (C14), so a merchant sees why rather than hunting for it.
 */
function MenuRow({ item }: { item: MoreItem }) {
    return (
        <DropdownMenuItem
            onSelect={item.go}
            disabled={item.disabled !== undefined}
            className={cn(
                MENU_ITEM,
                item.danger && !item.disabled
                    ? "text-destructive-subtle-foreground focus:bg-destructive-subtle focus:text-destructive-subtle-foreground active:bg-destructive-subtle"
                    : "focus:bg-muted",
                item.disabled && "text-muted-foreground",
            )}
        >
            <span className="min-w-0">
                <span className="block">{item.label}</span>
                {item.disabled ? (
                    <span className="mt-0.5 block text-pretty text-[11.5px] leading-[1.4] text-muted-foreground">
                        {item.disabled}
                    </span>
                ) : null}
            </span>
        </DropdownMenuItem>
    );
}

/**
 * The section tabs, by business kind: one row that scrolls sideways on a
 * phone rather than wrapping (default 28, C14), keeping the chosen tab in
 * view. Arrow keys move between them, as the design's tablist does; each
 * tab says how many rows sit behind it.
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
    // The chosen tab, whole, in view: on arrival from a `?tab=` link and
    // after every change. Only sideways — the page itself never moves.
    useEffect(() => {
        const row = list.current;
        const tab = row?.querySelector<HTMLElement>('[aria-selected="true"]');
        if (!row || !tab) return;
        const left = scrollToShow(row, {
            left: tab.offsetLeft,
            width: tab.offsetWidth,
        });
        if (left === null) return;
        const still = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        row.scrollTo({ left, behavior: still ? "auto" : "smooth" });
    }, [value]);
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
            className="relative flex flex-nowrap gap-0.5 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                            "inline-flex flex-none items-center whitespace-nowrap px-3.5 py-2.5 text-[13px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
                            on
                                ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--brand))]"
                                : "font-medium text-muted-foreground hover:text-foreground active:text-foreground/80",
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
