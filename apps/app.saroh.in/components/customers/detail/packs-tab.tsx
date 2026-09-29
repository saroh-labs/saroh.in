"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { useId, useState } from "react";

import type { ExtendTarget } from "@/components/class-packs/pack-detail/extend-dialog";
import { ExtendDialog } from "@/components/class-packs/pack-detail/extend-dialog";
import type { SellablePack } from "@/components/class-packs/sell-pack-dialog";
import { SellPackDialog } from "@/components/class-packs/sell-pack-dialog";
import { MAX_EXTEND_DAYS } from "@/lib/class-packs/pack-detail";
import type {
    CustomerDetail,
    DetailPack,
} from "@/lib/customer-workspace/detail";
import type { PackTabRow } from "@/lib/customer-workspace/packs";
import {
    heldPacks,
    packsEmptyText,
    packTabRows,
} from "@/lib/customer-workspace/packs";

import { Bar, CARD, Chips, Empty, Failed, RowPill } from "./parts";

/** What selling them a pack needs; null when this viewer may not sell. */
export interface PackSale {
    packs: readonly SellablePack[];
    invoicesOnSale: boolean;
}

const BAR = { ok: "ok", soon: "accent", ended: "off" } as const;

const WHEN = {
    soon: "text-brand",
    lost: "text-destructive-subtle-foreground",
    plain: "text-foreground/80",
} as const;

/** Why Extend is off for everyone: the role, said once per row. */
const NO_EXTEND = "Your role can't extend packs";

/** The design's small outline button ("See all bookings"). */
export const SMALL_BUTTON =
    "h-8 rounded-[9px] px-3 text-[12.5px] font-semibold coarse:h-11";

/**
 * Customer Detail's Packs tab (round-2 C7): every pack they've bought —
 * what is left, the use-by date, the days given, what they paid — and the
 * classes spent from each, latest first. A pack opens its Pack Detail; a
 * class opens its booking. Extend is E16's own dialog and action, and Sell
 * a pack the Class packs screen's own dialog with this person chosen.
 */
export function PacksTab({
    rows,
    first,
    canSell,
    canExtend,
    onSell,
    onExtend,
    timeZone,
    now,
}: {
    rows: readonly DetailPack[];
    first: string;
    canSell: boolean;
    /** `pack:write`: give a pack more days (E16). */
    canExtend: boolean;
    onSell: () => void;
    onExtend: (row: PackTabRow) => void;
    timeZone: string;
    now: Date;
}) {
    const lists = packTabRows(rows, timeZone, now);
    const [which, setWhich] = useState<"live" | "done">(
        lists.live.length === 0 && lists.done.length > 0 ? "done" : "live",
    );
    const list = lists[which];
    const head = (
        <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
            <p className="m-0 min-w-0 flex-1 text-pretty text-[12.5px] text-muted-foreground">
                Each booking uses one from a pack, and it goes back if they
                cancel in time.
                {canExtend
                    ? ` Extend a use-by date by up to ${MAX_EXTEND_DAYS} days at a time, with a reason.`
                    : ""}
            </p>
            {canSell ? (
                <Button
                    variant="outline"
                    onClick={onSell}
                    className={SMALL_BUTTON}
                >
                    Sell a pack
                </Button>
            ) : null}
        </div>
    );

    if (rows.length === 0) {
        return (
            <>
                {head}
                <Empty>{packsEmptyText(first, canSell)}</Empty>
            </>
        );
    }

    return (
        <>
            {head}
            <Chips
                label="Which packs"
                value={which}
                onChange={setWhich}
                height={32}
                chips={[
                    {
                        key: "live",
                        label: `Can still use · ${lists.live.length}`,
                    },
                    {
                        key: "done",
                        label: `Used up or expired · ${lists.done.length}`,
                    },
                ]}
            />
            {list.length === 0 ? (
                <Empty>
                    {which === "live"
                        ? `Nothing left to use. ${first}'s packs are used up or have ended.`
                        : "Nothing used up or ended yet."}
                </Empty>
            ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {list.map((r) => (
                        <PackItem
                            key={r.purchaseId}
                            row={r}
                            canExtend={canExtend}
                            onExtend={() => onExtend(r)}
                        />
                    ))}
                </ul>
            )}
        </>
    );
}

function PackItem({
    row,
    canExtend,
    onExtend,
}: {
    row: PackTabRow;
    canExtend: boolean;
    onExtend: () => void;
}) {
    const ids = { why: useId(), uses: useId() };
    const [open, setOpen] = useState(false);
    const why = canExtend ? row.extendBlock : NO_EXTEND;
    return (
        <li className={CARD}>
            <div className="flex flex-wrap items-center gap-3.5">
                <div className="min-w-0 flex-[2_1_220px]">
                    <div className="flex items-baseline gap-2.5">
                        <Link
                            href={row.href}
                            className="min-w-0 flex-1 rounded-[4px] text-[14px] font-semibold text-foreground transition-colors duration-fast hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-brand/80"
                        >
                            {row.name}
                        </Link>
                        <span className="text-[13px] font-semibold tabular-nums">
                            {row.left}
                        </span>
                    </div>
                    <Bar pct={row.pct} tone={BAR[row.bar]} />
                    <div
                        className={cn(
                            "mt-[5px] text-[12.5px] font-semibold",
                            WHEN[row.whenTone],
                        )}
                    >
                        {row.when}
                    </div>
                    {row.extNote ? (
                        <div className="mt-0.5 text-[12px] text-foreground/80">
                            {row.extNote}
                        </div>
                    ) : null}
                    <div className="mt-0.5 text-[12px] text-muted-foreground">
                        {row.bought}
                    </div>
                </div>
                <div className="flex max-w-[200px] flex-col items-end gap-1">
                    <Button
                        variant="outline"
                        disabled={why !== null}
                        aria-describedby={why ? ids.why : undefined}
                        aria-label={`Extend the ${row.name}`}
                        onClick={onExtend}
                        className={SMALL_BUTTON}
                    >
                        Extend
                    </Button>
                    {why ? (
                        <span
                            id={ids.why}
                            className="text-right text-[12px] text-muted-foreground"
                        >
                            {why}
                        </span>
                    ) : null}
                </div>
            </div>
            {row.uses.length > 0 ? (
                <div className="mt-2.5 border-t border-foreground/10 pt-2">
                    <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={ids.uses}
                        onClick={() => setOpen((o) => !o)}
                        className="rounded-[4px] text-[12.5px] font-semibold text-brand transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:opacity-70 coarse:min-h-11"
                    >
                        {open
                            ? `Hide the ${row.unitsWord} booked`
                            : `${row.unitsWord.charAt(0).toUpperCase()}${row.unitsWord.slice(1)} booked · ${row.uses.length}`}
                    </button>
                    {open ? (
                        <ul id={ids.uses} className="m-0 mt-1 list-none p-0">
                            {row.uses.map((u) => (
                                <li key={u.key}>
                                    <Link
                                        href={u.href}
                                        className="-mx-1.5 flex flex-wrap items-center gap-2.5 rounded-md px-1.5 py-[7px] text-[13px] text-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent"
                                    >
                                        <span className="flex-[0_0_130px] tabular-nums text-muted-foreground">
                                            {u.when}
                                        </span>
                                        <span className="min-w-0 flex-[1_1_140px] font-semibold">
                                            {u.what}
                                        </span>
                                        <RowPill tone={u.state.tone}>
                                            {u.state.label}
                                        </RowPill>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            ) : null}
        </li>
    );
}

/**
 * Customer Detail's packs, for the screen: the Packs tab, and selling and
 * extending from it — the Class packs screen's sell dialog with this
 * person chosen, and Pack Detail's Extend (E16), one path each, not a
 * second. Kept here so the screen only places them.
 */
export function useCustomerPacks({
    d,
    sale,
    canExtend,
    first,
    nowIso,
}: {
    d: CustomerDetail;
    /** Null when this viewer may not sell. */
    sale: PackSale | null;
    canExtend: boolean;
    first: string;
    nowIso: string;
}): {
    /** Opens the sell dialog; absent when this viewer may not sell. */
    onSell?: () => void;
    tab: React.ReactNode;
    dialogs: React.ReactNode;
} {
    const [selling, setSelling] = useState(false);
    const [extending, setExtending] = useState<ExtendTarget | null>(null);
    const onSell = sale ? () => setSelling(true) : undefined;
    const tab = d.packs ? (
        <PacksTab
            rows={d.packs.rows}
            first={first}
            canSell={!!sale}
            canExtend={canExtend}
            onSell={() => setSelling(true)}
            onExtend={(r) =>
                setExtending({
                    purchaseId: r.purchaseId,
                    name: d.contact.name,
                    expiresAt: r.expiresAt,
                })
            }
            timeZone={d.timezone}
            now={new Date(nowIso)}
        />
    ) : (
        <Failed what="Class packs" />
    );
    const dialogs = (
        <>
            {sale ? (
                <SellPackDialog
                    open={selling}
                    onOpenChange={setSelling}
                    contacts={[
                        {
                            id: d.contact.id,
                            name: d.contact.name,
                            email: d.contact.email,
                        },
                    ]}
                    packs={sale.packs}
                    initialContactId={d.contact.id}
                    invoicesOnSale={sale.invoicesOnSale}
                    held={heldPacks(d, new Date(nowIso))}
                />
            ) : null}
            {extending ? (
                <ExtendDialog
                    target={extending}
                    timeZone={d.timezone}
                    nowIso={nowIso}
                    onClose={() => setExtending(null)}
                />
            ) : null}
        </>
    );
    return { onSell, tab, dialogs };
}
