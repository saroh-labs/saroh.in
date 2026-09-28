"use client";

import { cn } from "@saroh/ui/lib/utils";
import { dismissToasts, showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
import { setPackArchived } from "@/lib/class-packs/actions";
import { packKind, unitWord } from "@/lib/class-packs/pack-cards";
import type { PackDetailTab } from "@/lib/class-packs/pack-detail";
import {
    PACK_DETAIL_TABS,
    archiveToast,
    detailHeader,
    tabMeta,
} from "@/lib/class-packs/pack-detail";
import type {
    PackDetail as Pack,
    PackHolder,
    PartRead,
} from "@/lib/class-packs/pack-detail-data";
import type { HolderRow } from "@/lib/class-packs/pack-holders";
import {
    holderRow,
    splitHolders,
    whoEmptyText,
} from "@/lib/class-packs/pack-holders";
import type { DropIn, ReceiptSource } from "@/lib/class-packs/pack-overview";
import {
    aboutRows,
    customerPreview,
    linkedCards,
    overviewTiles,
} from "@/lib/class-packs/pack-overview";
import type { HeldPack } from "@/lib/class-packs/sell-words";

import type { SellablePack } from "../sell-pack-dialog";
import { SellPackDialog } from "../sell-pack-dialog";
import { CustomerView } from "./customer-view";
import { GUTTER } from "./detail-crumbs";
import type { Lens } from "./detail-header";
import { PackDetailHeader } from "./detail-header";
import type { ExtendTarget } from "./extend-dialog";
import { ExtendDialog } from "./extend-dialog";
import { HoldersTab } from "./holders-tab";
import { PackOverviewTab } from "./overview";

/** An Undo toast lasts ten seconds (round-2 default 136). */
const UNDO_MS = 10_000;

/** What the sell dialog needs, read only for someone who may sell. */
export interface SellContext {
    contacts: ContactOption[];
    held: HeldPack[];
    packs: SellablePack[];
    invoicesOnSale: boolean;
}

/**
 * Bookings › Packs › one pack (round-2 E16, after "Saroh Pack Detail"): the
 * header with Sell at the desk and Edit pack, a Team and a Customer view,
 * and the tabs — Overview and Who has it here; Used this week, Sales and
 * Activity are E17's and join `PACK_DETAIL_TABS` as they are built.
 *
 * The pack is the page's one required read. Who has it is read on its own,
 * so its failing costs that tab and the Overview's lines about it, nothing
 * else. Extend is `pack:write`, as the API asks.
 */
export function PackDetailScreen({
    pack,
    holders,
    receipts,
    dropIns,
    freeCancelHours,
    timeZone,
    nowIso,
    canWrite,
    canSell,
    sell,
    initialTab,
}: {
    pack: Pack;
    holders: PartRead<PackHolder[]>;
    /** Its purchases with their invoice; null when not this person's to see. */
    receipts: ReceiptSource[] | null;
    dropIns: DropIn[] | null;
    freeCancelHours: number | null | undefined;
    timeZone: string;
    nowIso: string;
    canWrite: boolean;
    canSell: boolean;
    sell: SellContext | null;
    initialTab: PackDetailTab;
}) {
    const router = useRouter();
    const now = new Date(nowIso);
    const [tab, setTab] = useState<PackDetailTab>(initialTab);
    const [lens, setLens] = useState<Lens>("team");
    const [selling, setSelling] = useState(false);
    const [extending, setExtending] = useState<ExtendTarget | null>(null);
    const [busy, setBusy] = useState(false);
    const [, start] = useTransition();
    const tabsRef = useRef<HTMLDivElement>(null);

    const kind = packKind(pack);
    const head = detailHeader(pack);
    const list = holders.state === "ok" ? holders.data : null;
    const rows = list
        ? (() => {
              const { live, done } = splitHolders(list);
              const row = (h: PackHolder) => holderRow(h, pack, now, timeZone);
              return { live: live.map(row), done: done.map(row) };
          })()
        : null;
    const tabs = PACK_DETAIL_TABS.filter((t) => t.built);
    const sellable = canSell && head.onSale && sell !== null;

    function pick(next: PackDetailTab) {
        setTab(next);
        setLens("team");
        // The tab is in the address, so Back and a shared link land on it.
        const url = new URL(window.location.href);
        if (next === "overview") url.searchParams.delete("tab");
        else url.searchParams.set("tab", next);
        window.history.replaceState(null, "", url.pathname + url.search);
    }

    function keys(e: React.KeyboardEvent) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const i = tabs.findIndex((t) => t.key === tab);
        const n =
            (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
        pick(tabs[n].key);
        tabsRef.current
            ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
            .item(n)
            .focus();
    }

    function restore() {
        setBusy(true);
        start(async () => {
            const res = await setPackArchived(pack.id, false);
            setBusy(false);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            router.refresh();
            dismissToasts();
            showUndo(
                archiveToast(pack, false),
                () =>
                    start(async () => {
                        const back = await setPackArchived(pack.id, true);
                        if (!back.ok) showError(back.error);
                        router.refresh();
                    }),
                { duration: UNDO_MS },
            );
        });
    }

    function extend(row: HolderRow) {
        const h = list?.find((x) => x.purchaseId === row.purchaseId);
        if (!h) return;
        setExtending({
            purchaseId: h.purchaseId,
            name: h.contact.name,
            expiresAt: h.expiresAt,
        });
    }

    const preview = customerPreview(pack, now, timeZone);

    return (
        <>
            <PackDetailHeader
                name={pack.name}
                head={head}
                lens={lens}
                onLens={setLens}
                canSell={canSell}
                onSell={() => setSelling(sell !== null)}
                canWrite={canWrite}
                busy={busy}
                onRestore={restore}
            />

            {lens === "customer" ? (
                <CustomerView
                    name={pack.name}
                    note={preview.note}
                    line={preview.line}
                    price={preview.price}
                />
            ) : (
                <>
                    <div
                        ref={tabsRef}
                        role="tablist"
                        aria-label="Pack sections"
                        onKeyDown={keys}
                        className={cn(
                            // Scrolls sideways on a phone rather than wrapping.
                            "flex gap-0.5 overflow-x-auto border-b border-border pt-1.5",
                            GUTTER,
                        )}
                    >
                        {tabs.map((t) => {
                            const on = t.key === tab;
                            const meta = tabMeta(t.key, pack.overview);
                            return (
                                <button
                                    key={t.key}
                                    type="button"
                                    role="tab"
                                    id={`pack-tab-${t.key}`}
                                    aria-selected={on}
                                    aria-controls="pack-panel"
                                    tabIndex={on ? 0 : -1}
                                    onClick={() => pick(t.key)}
                                    className={cn(
                                        "-mb-px inline-flex flex-none cursor-pointer items-center whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:text-foreground/70 coarse:min-h-11",
                                        on
                                            ? "border-brand font-semibold text-foreground"
                                            : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {t.label}
                                    {meta ? (
                                        <span
                                            className={cn(
                                                "ml-1.5 rounded-full px-1.5 py-px text-[11px] font-semibold",
                                                meta.tone === "accent"
                                                    ? "bg-brand-subtle text-brand-subtle-foreground"
                                                    : "bg-muted text-muted-foreground",
                                            )}
                                        >
                                            {meta.text}
                                        </span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                    <div
                        id="pack-panel"
                        role="tabpanel"
                        aria-labelledby={`pack-tab-${tab}`}
                        className={cn("pb-[26px] pt-5", GUTTER)}
                    >
                        {tab === "who" ? (
                            <HoldersTab
                                rows={rows}
                                denied={holders.state === "denied"}
                                unitsWord={unitWord(kind, 2)}
                                emptyLive={whoEmptyText("live", kind)}
                                canExtend={canWrite}
                                sellable={sellable}
                                onSell={() => setSelling(true)}
                                onExtend={extend}
                                onRetry={() => router.refresh()}
                            />
                        ) : (
                            // E17 adds Used this week, Sales and Activity
                            // here, one panel per tab it builds.
                            <PackOverviewTab
                                tiles={overviewTiles(pack)}
                                linked={linkedCards(pack, {
                                    dropIns,
                                    holders: list,
                                    receipts,
                                    now,
                                    timeZone,
                                })}
                                about={aboutRows(pack, {
                                    freeCancelHours,
                                    timeZone,
                                })}
                                editHref={canWrite ? head.editHref : null}
                                onTab={pick}
                                onCustomerView={() => setLens("customer")}
                            />
                        )}
                    </div>
                </>
            )}

            {extending ? (
                <ExtendDialog
                    target={extending}
                    timeZone={timeZone}
                    nowIso={nowIso}
                    onClose={() => setExtending(null)}
                />
            ) : null}
            {selling && sell ? (
                <SellPackDialog
                    open
                    onOpenChange={(open) => setSelling(open)}
                    contacts={sell.contacts}
                    packs={sell.packs}
                    initialPackId={pack.id}
                    invoicesOnSale={sell.invoicesOnSale}
                    held={sell.held}
                />
            ) : null}
        </>
    );
}
