"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { PageHeader } from "@saroh/ui/page-header";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { MoreHorizontal, Ticket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import { setPackArchived } from "@/lib/class-packs/actions";
import type { ClassPack } from "@/lib/class-packs/service";
import { invoiceMoney } from "@/lib/invoices/money";

import { ClassPacksTabs } from "./class-packs-tabs";
import { SellPackDialog } from "./sell-pack-dialog";

const FILTERS: DataFilter<ClassPack>[] = [
    {
        id: "on-sale",
        label: "On sale",
        predicate: (p) => p.status === "ACTIVE",
    },
    {
        id: "archived",
        label: "Archived",
        predicate: (p) => p.status === "ARCHIVED",
    },
];

/** "48 sold · 31 still live", or "Not sold yet". */
function soldLine(p: ClassPack): string {
    if (p.sold === 0) return "Not sold yet";
    return `${p.sold} sold · ${p.activeHolders} still live`;
}

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/**
 * Class packs, after the "Saroh Billing and Classes" design: each pack, its
 * classes, how long it lasts, what it is usable on and its price, with how
 * many were sold and how many are still live under its name. What was bought
 * is frozen at the sale, so a change here never rewrites someone's classes.
 */
export function PacksScreen({
    packs,
    contacts,
    canWrite,
    invoicesOnSale,
    initialFilterId,
    openSell,
}: {
    packs: ClassPack[];
    contacts: ContactOption[];
    canWrite: boolean;
    invoicesOnSale: boolean;
    initialFilterId?: string;
    /** Opened from ⌘K's "Sell a pack". */
    openSell: boolean;
}) {
    const router = useRouter();
    const [selling, setSelling] = useState<{ packId?: string } | null>(
        openSell ? {} : null,
    );

    function onSellOpenChange(open: boolean) {
        if (open) return;
        setSelling(null);
        if (!openSell) return;
        const url = new URL(window.location.href);
        url.searchParams.delete("sell");
        router.replace(url.pathname + url.search, { scroll: false });
    }

    const columns: DataColumn<ClassPack>[] = [
        {
            id: "pack",
            header: "Pack",
            priority: "primary",
            sortValue: (p) => p.name.toLowerCase(),
            cell: (p) => (
                <span className="block min-w-0">
                    <span
                        className={
                            p.status === "ARCHIVED"
                                ? "block truncate font-medium text-muted-foreground"
                                : "block truncate font-medium"
                        }
                    >
                        {p.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                        {soldLine(p)}
                    </span>
                </span>
            ),
        },
        {
            id: "classes",
            header: "Classes",
            priority: "secondary",
            numeric: true,
            width: "90px",
            sortValue: (p) => p.credits,
            cell: (p) => p.credits,
        },
        {
            id: "valid",
            header: "Valid for",
            priority: "secondary",
            width: "112px",
            sortValue: (p) => p.validityDays,
            cell: (p) => days(p.validityDays),
        },
        {
            id: "usable",
            header: "Usable on",
            priority: "detail",
            cell: (p) => (
                <span className="block truncate text-[12.5px]">
                    {p.services.map((s) => s.name).join(", ")}
                </span>
            ),
        },
        {
            id: "price",
            header: "Price",
            priority: "detail",
            numeric: true,
            money: true,
            width: "118px",
            sortValue: (p) => Number(p.price),
            cell: (p) => invoiceMoney(p.price, p.currency),
        },
        {
            id: "status",
            header: "Status",
            priority: "secondary",
            width: "100px",
            cell: (p) =>
                p.status === "ARCHIVED" ? (
                    <Badge variant="neutral">Archived</Badge>
                ) : (
                    <Badge variant="success">On sale</Badge>
                ),
        },
    ];

    return (
        <>
            <PageHeader
                title="Class packs"
                className="mb-0"
                actions={
                    canWrite ? (
                        <>
                            <Button onClick={() => setSelling({})}>
                                Sell a pack
                            </Button>
                            <Button variant="outline" asChild>
                                <Link href="/class-packs/new">
                                    New class pack
                                </Link>
                            </Button>
                        </>
                    ) : undefined
                }
            />
            <ClassPacksTabs current="packs" />
            <DataView
                viewId="class-packs"
                rows={packs}
                columns={columns}
                rowKey={(p) => p.id}
                rowHref={
                    canWrite ? (p) => `/class-packs/${p.id}/edit` : undefined
                }
                rowActions={
                    canWrite
                        ? (p) => (
                              <RowActions
                                  pack={p}
                                  onSell={() => setSelling({ packId: p.id })}
                              />
                          )
                        : undefined
                }
                modes={["table", "list"]}
                hideModeToggle
                filters={FILTERS}
                initialFilterId={initialFilterId}
                noun={{ one: "pack", other: "packs" }}
                searchPlaceholder="Search packs"
                searchableColumnIds={["pack"]}
                emptyState={{
                    icon: <Ticket />,
                    title: "No class packs yet",
                    note: "A pack is a number of classes for a price, used within so many days — ten classes in ninety days, say. Sell one, and each booking paid with it takes a class off.",
                    action: canWrite ? (
                        <Button asChild>
                            <Link href="/class-packs/new">New class pack</Link>
                        </Button>
                    ) : undefined,
                }}
            />
            <p className="max-w-[68ch] text-pretty text-[12px] text-muted-foreground">
                {invoicesOnSale
                    ? "Selling a pack issues its invoice at once. "
                    : ""}
                Classes come off when one is booked with it and go back if the
                booking is cancelled.
            </p>

            {canWrite && selling ? (
                <SellPackDialog
                    open
                    onOpenChange={onSellOpenChange}
                    contacts={contacts}
                    packs={packs}
                    initialPackId={selling.packId}
                    invoicesOnSale={invoicesOnSale}
                />
            ) : null}
        </>
    );
}

/** Sell, edit, archive or put back on sale. Holders keep using an archived pack. */
function RowActions({ pack, onSell }: { pack: ClassPack; onSell: () => void }) {
    const router = useRouter();
    const archived = pack.status === "ARCHIVED";

    async function setArchived(next: boolean) {
        const res = await setPackArchived(pack.id, next);
        if (!res.ok) return showError(res.error);
        router.refresh();
        if (next) {
            showUndo(
                `${pack.name} is archived — no new sales. Anyone holding one keeps using it.`,
                () => void setArchived(false),
            );
        } else {
            showSuccess(`${pack.name} is on sale again`);
        }
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Actions for ${pack.name}`}
                >
                    <MoreHorizontal className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
                {!archived ? (
                    <DropdownMenuItem onSelect={onSell}>
                        Sell this pack
                    </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem asChild>
                    <Link href={`/class-packs/${pack.id}/edit`}>Edit</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void setArchived(!archived)}>
                    {archived ? "Put it back on sale" : "Archive"}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
