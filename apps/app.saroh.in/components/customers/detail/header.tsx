"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import { Globe, MoreHorizontal } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/shared/status-badge";
import type { MoreItem } from "@/lib/customer-workspace/more-menu";
import type { Tab, TabKey, Tag } from "@/lib/customer-workspace/view";
import { phoneLabel } from "@/lib/organizations/business-phone";
import { TabStrip } from "@saroh/ui/tabs";
import { Tip } from "@saroh/ui/tooltip";
/** A menu row: the design's 8px by 10px, 7px corners. */
const MENU_ITEM =
    "cursor-pointer items-start rounded-[7px] px-2.5 py-2 text-[13px] active:bg-accent-active data-[disabled]:cursor-not-allowed data-[disabled]:opacity-100";

/** Why a role reads but can't act, in the design's words. */
export const EDIT_OFF =
    "Your role can't edit customers. An owner can give you access in Team.";
export const MORE_OFF = "Merging and removing need permission from an owner.";

/**
 * The person's page header. Where they sit ("Sell › Customers › Priya
 * Raman", or "Contacts › …" where nothing is sold), then who they are: initials, name and its word (Returning, Member), what the
 * team must know (Needs attention's tags), since when, and how to reach
 * them — then New order and New booking for them (#247), Edit details (`contact:write`) and ⋯ More actions (edit,
 * merge or remove, each on its own permission). A role that only reads is
 * told so.
 */
export function Header({
    sells,
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
    /** The crumbs say Sell › Customers; otherwise Contacts. */
    sells: boolean;
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
            <PageHeader
                holdsData
                className="mb-3.5"
                breadcrumb={
                    sells
                        ? [
                              "Sell",
                              <Link key="list" href="/commerce/customers">
                                  Customers
                              </Link>,
                              name,
                          ]
                        : [
                              <Link key="list" href="/contacts">
                                  Contacts
                              </Link>,
                              name,
                          ]
                }
                lead={
                    <div
                        aria-hidden
                        className="flex size-[52px] items-center justify-center rounded-full bg-muted font-display text-[18px] font-semibold text-foreground"
                    >
                        {initials}
                    </div>
                }
                // A long name wraps, however unbroken, and the tags beside
                // it wrap under it — never off-screen.
                title={name}
                badge={
                    tag || attention ? (
                        <>
                            {tag ? (
                                <span title={tag.title} className="inline-flex">
                                    <StatusBadge tone={tag.tone}>
                                        {tag.label}
                                    </StatusBadge>
                                </span>
                            ) : null}
                            {attention}
                        </>
                    ) : undefined
                }
                description={
                    <>
                        <p className="text-[13px] text-muted-foreground">
                            {since}
                        </p>
                        {/* Phone and email are part of the person: whoever
                            reads the customer (`contact:read`) sees them
                            (matrix §3). */}
                        <div className="mt-[5px] flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px]">
                            {email ? (
                                // A long address wraps on a phone, whole,
                                // rather than pushing the page sideways.
                                <a
                                    href={`mailto:${email}`}
                                    className="min-w-0 max-w-full text-foreground underline decoration-border-strong underline-offset-4 transition-colors duration-fast [overflow-wrap:anywhere] hover:decoration-foreground active:text-muted-foreground"
                                >
                                    {email}
                                </a>
                            ) : (
                                <span className="text-foreground/75">
                                    No email
                                </span>
                            )}
                            <span className="text-foreground/75">
                                {phone?.trim() ? phoneLabel(phone) : "No phone"}
                            </span>
                            {/* On the same line as how to reach them. The
                                address is said once: when they sign in with
                                the email already shown, only the fact is. */}
                            {signsIn ? (
                                <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                                    <Globe
                                        aria-hidden
                                        className="size-[13px] shrink-0"
                                    />
                                    {email && signsIn.endsWith(` as ${email}`)
                                        ? signsIn.slice(
                                              0,
                                              -` as ${email}`.length,
                                          )
                                        : signsIn}
                                </span>
                            ) : null}
                        </div>
                    </>
                }
                // On a phone the group drops under the name and wraps a
                // button to its own line, full size, rather than shrink.
                actions={
                    <>
                        {starts.map((s) => (
                            <Button key={s.href} variant="outline" asChild>
                                <Link href={s.href}>{s.label}</Link>
                            </Button>
                        ))}
                        <Tip label={canEdit ? undefined : EDIT_OFF}>
                            <Button
                                variant="outline"
                                disabled={!canEdit}
                                onClick={onEdit}
                            >
                                Edit details
                            </Button>
                        </Tip>
                        {menu.length ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Tip
                                        label={
                                            canMore ? "More actions" : MORE_OFF
                                        }
                                    >
                                        <Button
                                            size="icon"
                                            variant="outline"
                                            className="data-[state=open]:border-border-strong data-[state=open]:bg-accent"
                                            disabled={!canMore}
                                            aria-label="More actions"
                                        >
                                            <MoreHorizontal
                                                aria-hidden
                                                className="size-4"
                                            />
                                        </Button>
                                    </Tip>
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
                    </>
                }
            />
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
 * The section tabs, by business kind, on the shared strip: one row that
 * scrolls sideways on a phone rather than wrapping (default 28, C14),
 * keeping the chosen tab in view. Each tab says how many rows sit behind it.
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
    return (
        <TabStrip
            label="Customer sections"
            idPrefix="tab"
            value={value}
            onValueChange={onChange}
            tabs={tabs.map((t) => ({
                value: t.key,
                label: t.label,
                controls: `panel-${t.key}`,
                // No count on Overview, or where the source failed.
                count: t.count === null || t.count === 0 ? undefined : t.count,
            }))}
        />
    );
}
