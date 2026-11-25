"use client";

import { cn } from "@saroh/ui/lib/utils";
import { dismissToasts, showError, showUndo } from "@saroh/ui/toast";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";

import { setPackArchived } from "@/lib/class-packs/actions";
import { usedEmptyText, usedRows } from "@/lib/class-packs/pack-activity";
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
    PackEventsPage,
    PackHolder,
    PackSale,
    PackUsedPage,
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
    coverLines,
    customerPreview,
    linkedCards,
    overviewTiles,
} from "@/lib/class-packs/pack-overview";
import {
    priceHistory,
    saleRow,
    salesByMonth,
} from "@/lib/class-packs/pack-sales";
import type { SellContext } from "@/lib/class-packs/queries";
import { useClassPackSave, usePack } from "@/lib/class-packs/use-class-packs";
import { invoicesHref } from "@/lib/invoices/links";

import { SellPackDialog } from "@/components/class-packs/list/sell-pack-dialog";
import { TabStrip } from "@saroh/ui/tabs";
import { ActivityTab } from "./activity-tab";
import { CustomerView } from "./customer-view";

import { runAction } from "@/lib/api/run-action";
import type { Lens } from "./detail-header";
import { GUTTER, PackDetailHeader } from "./detail-header";
import type { ExtendTarget } from "./extend-dialog";
import { ExtendDialog } from "./extend-dialog";
import { HoldersTab } from "./holders-tab";
import { PackOverviewTab } from "./overview";
import { SalesTab } from "./sales-tab";
import { UsedTab } from "./used-tab";

export type { SellContext };

/**
 * One pack's page on React Query (DEC-259): its one read
 * (`/api/class-packs/[packId]`), behind the route's loader until it lands,
 * since the title, tabs and actions are the pack's. Failing fails the page.
 */
export function PackDetailContainer({
    packId,
    skeleton,
    ...gates
}: {
    packId: string;
    skeleton: ReactNode;
    canWrite: boolean;
    canSell: boolean;
    initialTab: PackDetailTab;
}) {
    const read = usePack({ packId });
    const [nowIso] = useState(() => new Date().toISOString());
    if (read.isError && !read.data) throw read.error;
    if (!read.data) return <>{skeleton}</>;
    return (
        <PackDetailScreen
            // Another pack starts on its own tab and lens.
            key={read.data.pack.id}
            {...read.data}
            {...gates}
            nowIso={nowIso}
            onRetry={() => void read.refetch()}
        />
    );
}

/**
 * Bookings › Packs › one pack (round-2 E16 and E17, after "Saroh Pack
 * Detail"): the header with Sell at the desk and Edit pack, a Team and a
 * Customer view, and the tabs — Overview, Who has it (E16), Used this week,
 * Sales and Activity (E17).
 *
 * The pack is the page's one required read. Who has it, the week's uses,
 * the sales and the activity are each read on their own, so one failing
 * costs its tab (and the lines built from it), nothing else. Extend is
 * `pack:write`, as the API asks.
 */
export function PackDetailScreen({
    pack,
    holders,
    used,
    sales,
    events,
    invoices,
    receipts,
    dropIns,
    freeCancelHours,
    timeZone,
    nowIso,
    canWrite,
    canSell,
    sell,
    initialTab,
    onRetry,
}: {
    /** A tab's own read failed: read the pack's page again. */
    onRetry: () => void;
    pack: Pack;
    holders: PartRead<PackHolder[]>;
    used: PartRead<PackUsedPage>;
    sales: PartRead<PackSale[]>;
    events: PartRead<PackEventsPage>;
    /** This person may open invoices and Payments is on: receipts link. */
    invoices: boolean;
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
    const save = useClassPackSave();
    const now = new Date(nowIso);
    const [tab, setTab] = useState<PackDetailTab>(initialTab);
    const [lens, setLens] = useState<Lens>("team");
    const [selling, setSelling] = useState(false);
    const [extending, setExtending] = useState<ExtendTarget | null>(null);
    const [busy, setBusy] = useState(false);
    const [, start] = useTransition();

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
    const saleList = sales.state === "ok" ? sales.data : null;
    const byMonth = salesByMonth(saleList ?? [], pack.currency, now, timeZone);
    const history =
        events.state === "ok"
            ? priceHistory(pack, events.data, saleList, timeZone)
            : null;
    const counts = {
        used: used.state === "ok" ? used.data.uses.length : null,
        activity:
            events.state === "ok"
                ? {
                      n: events.data.events.length,
                      more: events.data.nextCursor !== null,
                  }
                : null,
    };

    function pick(next: PackDetailTab) {
        setTab(next);
        setLens("team");
        // The tab is in the address, so Back and a shared link land on it.
        const url = new URL(window.location.href);
        if (next === "overview") url.searchParams.delete("tab");
        else url.searchParams.set("tab", next);
        window.history.replaceState(null, "", url.pathname + url.search);
    }

    function restore() {
        setBusy(true);
        start(async () => {
            const res = await runAction(() =>
                setPackArchived(pack.id, false, save.orgId),
            );
            setBusy(false);
            if (!res) return;
            if (!res.ok) {
                showError(res.error);
                return;
            }
            await save.saved();
            dismissToasts();
            showUndo(archiveToast(pack, false), () =>
                start(async () => {
                    const back = await runAction(() =>
                        setPackArchived(pack.id, true, save.orgId),
                    );
                    if (!back) return;
                    if (!back.ok) return showError(back.error);
                    await save.saved();
                }),
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
                    <TabStrip
                        label="Pack sections"
                        idPrefix="pack-tab"
                        value={tab}
                        onValueChange={pick}
                        listClassName={cn("pt-1.5", GUTTER)}
                        tabs={tabs.map((t) => {
                            const meta = tabMeta(t.key, pack.overview, counts);
                            return {
                                value: t.key,
                                label: t.label,
                                controls: "pack-panel",
                                count: meta?.text,
                                countTone:
                                    meta?.tone === "accent"
                                        ? ("strong" as const)
                                        : ("neutral" as const),
                            };
                        })}
                    />
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
                                onRetry={onRetry}
                            />
                        ) : tab === "used" ? (
                            <UsedTab
                                rows={
                                    used.state === "ok"
                                        ? usedRows(used.data, timeZone)
                                        : null
                                }
                                denied={used.state === "denied"}
                                chips={coverLines(pack, dropIns)}
                                emptyText={usedEmptyText(kind)}
                                onRetry={onRetry}
                            />
                        ) : tab === "sales" ? (
                            <SalesTab
                                sales={
                                    saleList?.map((s) =>
                                        saleRow(s, pack, {
                                            timeZone,
                                            invoices,
                                        }),
                                    ) ?? null
                                }
                                denied={sales.state === "denied"}
                                months={byMonth.months}
                                monthsNote={byMonth.note}
                                history={history}
                                allReceiptsHref={
                                    invoices
                                        ? invoicesHref({ pack: pack.id })
                                        : null
                                }
                                onRetry={onRetry}
                            />
                        ) : tab === "activity" ? (
                            <ActivityTab
                                packId={pack.id}
                                first={
                                    events.state === "ok" ? events.data : null
                                }
                                denied={events.state === "denied"}
                                pack={pack}
                                kind={kind}
                                timeZone={timeZone}
                                onRetry={onRetry}
                            />
                        ) : (
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
                                    priceHistory: history?.about ?? null,
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
                    gst={sell.gst}
                    held={sell.held}
                />
            ) : null}
        </>
    );
}
