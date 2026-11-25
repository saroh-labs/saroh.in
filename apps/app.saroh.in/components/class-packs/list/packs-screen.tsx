"use client";

import { count } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { IntentLink } from "@saroh/ui/intent-link";
import { countLabel, PageHeader } from "@saroh/ui/page-header";
import { dismissToasts, showError, showUndo } from "@saroh/ui/toast";
import { Ticket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { MissingRatesNotice } from "@/components/gst-rates/missing-rates-notice";
import {
    FigureLoading,
    PageLoading,
} from "@/components/shared/page/page-loading";
import { setPackArchived } from "@/lib/class-packs/actions";
import type { PackListItem } from "@/lib/class-packs/pack-cards";
import { orderForList, packCard } from "@/lib/class-packs/pack-cards";
import type { PacksView } from "@/lib/class-packs/queries";
import {
    useClassPackSave,
    usePacksList,
} from "@/lib/class-packs/use-class-packs";
import type { MissingRates } from "@/lib/gst-rates/missing";
import { gstAskOf } from "@/lib/gst-rates/missing";

import { runAction } from "@/lib/api/run-action";
import { ClassPacksTabs } from "./class-packs-tabs";
import { MembershipsNote } from "./memberships-note";
import { PackCard } from "./pack-card";
import { SellPackDialog } from "./sell-pack-dialog";

/** Archived, with who keeps what: the toast Undo sits beside. */
function archiveToast(pack: PackListItem, archived: boolean): string {
    if (!archived) return `${pack.name} is on sale again.`;
    const people = pack.people ?? pack.activeHolders;
    return people > 0
        ? `${pack.name} archived. Nobody new can buy it. ${count(people, "person keeps", "people keep")} their classes until their dates.`
        : `${pack.name} archived. Nobody new can buy it.`;
}

/** The Packs list's container: its one read, which failing fails the page. */
export function PacksContainer(
    props: Omit<Parameters<typeof PacksScreen>[0], "data">,
) {
    const packs = usePacksList();
    if (packs.isError && !packs.data) throw packs.error;
    return <PacksScreen {...props} data={packs.data ?? null} />;
}

/**
 * Bookings › Packs (round-2 E15, after "Saroh Packs"): one card per pack —
 * kind, price, terms, first-pack-only, Draft or "Changes not published",
 * what it sold and what is still to use — with Sell at the desk on each.
 * What was bought is frozen at the sale, so a change here never rewrites
 * anyone's classes. "Who holds one" stays a tab away.
 *
 * On React Query (DEC-259): the frame (header, New pack, tabs) is drawn at
 * once from the page's gates; the cards, the summary and the rule line
 * come with `data`, skeletons until then.
 */
export function PacksScreen({
    data,
    canWrite,
    canSell,
    openSell,
    missingRates = null,
}: {
    /**
     * What is on sale with a price and no GST rate, for a GST-registered
     * business; null when it couldn't be told, which draws nothing.
     */
    missingRates?: MissingRates | null;
    /** The packs read (`/api/class-packs`); null while on its way. */
    data: PacksView | null;
    canWrite: boolean;
    canSell: boolean;
    /** Opened from ⌘K's "Sell a pack". */
    openSell: boolean;
}) {
    const router = useRouter();
    const save = useClassPackSave();
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
            const res = await runAction(() =>
                setPackArchived(pack.id, archived, save.orgId),
            );
            setBusyId(null);
            if (!res) return;
            if (!res.ok) {
                showError(res.error);
                return;
            }
            await save.saved();
            // One Undo on screen at a time: an older one would undo the
            // wrong pack.
            dismissToasts();
            showUndo(archiveToast(pack, archived), () =>
                start(async () => {
                    const back = await runAction(() =>
                        setPackArchived(pack.id, !archived, save.orgId),
                    );
                    if (!back) return;
                    if (!back.ok) return showError(back.error);
                    await save.saved();
                }),
            );
        });
    }

    const packs = data?.packs ?? [];
    const ordered = orderForList(packs);

    return (
        <>
            <PageHeader
                holdsData="description"
                breadcrumb={[
                    <IntentLink
                        data-ph-unmask=""
                        key="bookings"
                        href="/bookings"
                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        Bookings
                    </IntentLink>,
                    "Class packs",
                ]}
                title="Class packs"
                count={
                    data
                        ? countLabel(packs.length, {
                              one: "pack",
                              other: "packs",
                          })
                        : undefined
                }
                description={
                    <span className="block max-w-[720px] text-pretty text-[13px] leading-[1.5] text-foreground/80">
                        {data ? data.rules : <FigureLoading className="w-72" />}
                    </span>
                }
                // A summary, not a button: before the actions.
                meta={data ? data.summary : <FigureLoading className="w-40" />}
                actions={
                    canWrite ? (
                        <>
                            <Button asChild variant="outline">
                                <IntentLink href="/class-packs/new?kind=one-to-one">
                                    New one-to-one pack
                                </IntentLink>
                            </Button>
                            <Button asChild>
                                <IntentLink href="/class-packs/new">
                                    New pack
                                </IntentLink>
                            </Button>
                        </>
                    ) : undefined
                }
                className="mb-0"
            />
            <ClassPacksTabs current="packs" />
            {/* Priced things on sale with no GST rate, for a registered
                business: one line, and the sheet to choose them in. */}
            <MissingRatesNotice missing={missingRates} />

            <p
                data-ph-unmask=""
                className="text-pretty text-[13px] text-foreground/80"
            >
                Changing a pack only changes what&apos;s sold next. Packs people
                already have keep their classes, price and dates.
            </p>

            {!data ? (
                <PageLoading
                    bare
                    shape="rows"
                    width="full"
                    label="Loading class packs"
                />
            ) : ordered.length === 0 ? (
                <EmptyState
                    icon={<Ticket />}
                    title="No class packs yet"
                    description="A pack is a number of classes for one price, used within a set time."
                    action={
                        canWrite ? (
                            <Button asChild>
                                <IntentLink href="/class-packs/new">
                                    New pack
                                </IntentLink>
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
                                notes={data.notes[p.id] ?? []}
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

            {data?.memberships && data.memberships.length > 0 ? (
                <MembershipsNote plans={data.memberships} />
            ) : null}

            {canSell && selling && data ? (
                <SellPackDialog
                    open
                    onOpenChange={onSellOpenChange}
                    contacts={data.contacts}
                    packs={packs}
                    initialPackId={selling.packId}
                    invoicesOnSale={data.invoicesOnSale}
                    held={data.held}
                    gst={gstAskOf(missingRates)}
                />
            ) : null}
        </>
    );
}
