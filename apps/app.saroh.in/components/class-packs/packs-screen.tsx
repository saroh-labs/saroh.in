"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { PageHeader } from "@saroh/ui/page-header";
import { dismissToasts, showError, showUndo } from "@saroh/ui/toast";
import { Ticket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
import { setPackArchived } from "@/lib/class-packs/actions";
import type { PackListItem } from "@/lib/class-packs/pack-cards";
import { orderForList, packCard } from "@/lib/class-packs/pack-cards";
import type { MembershipPlan } from "@/lib/class-packs/packs-page";
import type { HeldPack } from "@/lib/class-packs/sell-words";

import { ClassPacksTabs } from "./class-packs-tabs";
import { MembershipsNote } from "./memberships-note";
import { PackCard } from "./pack-card";
import { SellPackDialog } from "./sell-pack-dialog";

/** An Undo toast lasts ten seconds (round-2 default 136). */
const UNDO_MS = 10_000;
const BUTTON = "h-[38px] rounded-[9px] px-4 text-[14px] font-semibold";

/** Archived, with who keeps what: the toast Undo sits beside. */
function archiveToast(pack: PackListItem, archived: boolean): string {
    if (!archived) return `${pack.name} is on sale again.`;
    const people = pack.people ?? pack.activeHolders;
    return people > 0
        ? `${pack.name} archived. Nobody new can buy it; ${people} ${people === 1 ? "person keeps" : "people keep"} their classes until their dates.`
        : `${pack.name} archived. Nobody new can buy it.`;
}

/**
 * Bookings › Packs (round-2 E15, after "Saroh Packs"): one card per pack —
 * kind, price, terms, first-pack-only, Draft or "Changes not published",
 * what it sold and what is still to use — with Sell at the desk on each.
 * What was bought is frozen at the sale, so a change here never rewrites
 * anyone's classes. "Who holds one" stays a tab away.
 */
export function PacksScreen({
    packs,
    contacts,
    held,
    canWrite,
    canSell,
    invoicesOnSale,
    summary,
    rules,
    memberships,
    openSell,
}: {
    packs: PackListItem[];
    contacts: ContactOption[];
    /** The purchases the page read, for first-pack-only and "Has 4 left". */
    held: HeldPack[];
    canWrite: boolean;
    canSell: boolean;
    invoicesOnSale: boolean;
    /** "12 classes still owed to 5 people · …". */
    summary: string;
    /** How a booking spends a class, and when a cancel gives it back. */
    rules: string;
    /** Live membership plans; null or empty draws no note. */
    memberships: MembershipPlan[] | null;
    /** Opened from ⌘K's "Sell a pack". */
    openSell: boolean;
}) {
    const router = useRouter();
    const [selling, setSelling] = useState<{ packId?: string } | null>(
        openSell ? {} : null,
    );
    const [busyId, setBusyId] = useState<string | null>(null);
    const [, start] = useTransition();

    function onSellOpenChange(open: boolean) {
        if (open) return;
        setSelling(null);
        if (!openSell) return;
        const url = new URL(window.location.href);
        url.searchParams.delete("sell");
        router.replace(url.pathname + url.search, { scroll: false });
    }

    function setArchived(pack: PackListItem, archived: boolean) {
        setBusyId(pack.id);
        start(async () => {
            const res = await setPackArchived(pack.id, archived);
            setBusyId(null);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            router.refresh();
            // One Undo on screen at a time: an older one would undo the
            // wrong pack.
            dismissToasts();
            showUndo(
                archiveToast(pack, archived),
                () =>
                    start(async () => {
                        const back = await setPackArchived(pack.id, !archived);
                        if (!back.ok) showError(back.error);
                        router.refresh();
                    }),
                { duration: UNDO_MS },
            );
        });
    }

    const ordered = orderForList(packs);

    return (
        <>
            <PageHeader
                breadcrumb={[
                    <Link
                        key="bookings"
                        href="/bookings"
                        className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        Bookings
                    </Link>,
                    "Packs",
                ]}
                title="Class packs"
                description={
                    <span className="block max-w-[720px] text-pretty text-[13px] leading-[1.5] text-foreground/80">
                        {rules}
                    </span>
                }
                actions={
                    <span className="text-[12.5px] text-muted-foreground">
                        {summary}
                    </span>
                }
                className="mb-0"
            />
            <ClassPacksTabs current="packs" />

            <div className="flex flex-wrap items-center gap-2.5">
                <p className="flex-[1_1_280px] text-pretty text-[13px] text-foreground/80">
                    Changing a pack only changes what&apos;s sold next. Packs
                    people already have keep their classes, price and dates.
                </p>
                {canWrite ? (
                    <>
                        <Button asChild className={BUTTON}>
                            <Link href="/class-packs/new">New pack</Link>
                        </Button>
                        <Button asChild variant="outline" className={BUTTON}>
                            <Link href="/class-packs/new?kind=one-to-one">
                                New one-to-one pack
                            </Link>
                        </Button>
                    </>
                ) : null}
            </div>

            {ordered.length === 0 ? (
                <EmptyState
                    icon={<Ticket />}
                    title="No packs yet"
                    description="A pack is a number of classes for one price, used within a set time. Customers see it when they book a class."
                    action={
                        canWrite ? (
                            <Button asChild>
                                <Link href="/class-packs/new">New pack</Link>
                            </Button>
                        ) : undefined
                    }
                />
            ) : (
                <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
                    {ordered.map((p) => (
                        <li key={p.id} className="min-w-0">
                            <PackCard
                                card={packCard(p, canWrite)}
                                canWrite={canWrite}
                                canSell={canSell}
                                busy={busyId === p.id}
                                onSell={() => setSelling({ packId: p.id })}
                                onArchive={() =>
                                    setArchived(p, p.status !== "ARCHIVED")
                                }
                            />
                        </li>
                    ))}
                </ul>
            )}

            {memberships && memberships.length > 0 ? (
                <MembershipsNote plans={memberships} />
            ) : null}

            {canSell && selling ? (
                <SellPackDialog
                    open
                    onOpenChange={onSellOpenChange}
                    contacts={contacts}
                    packs={packs}
                    initialPackId={selling.packId}
                    invoicesOnSale={invoicesOnSale}
                    held={held}
                />
            ) : null}
        </>
    );
}
