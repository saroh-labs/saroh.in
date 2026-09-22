"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import { Ticket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import { ViewerDate } from "@/components/shared/viewer-date";
import type { PackStanding } from "@/lib/class-packs/balance";
import type { ClassPack, PackPurchase } from "@/lib/class-packs/service";
import { invoiceMoney } from "@/lib/invoices/money";

import { ClassPacksTabs } from "./class-packs-tabs";
import { SellPackDialog } from "./sell-pack-dialog";

const STANDING: Record<
    PackStanding,
    { label: string; variant: "success" | "neutral" }
> = {
    ACTIVE: { label: "Active", variant: "success" },
    USED_UP: { label: "Used up", variant: "neutral" },
    EXPIRED: { label: "Expired", variant: "neutral" },
};

const FILTERS: DataFilter<PackPurchase>[] = (
    ["ACTIVE", "USED_UP", "EXPIRED"] as const
).map((s) => ({
    id: s.toLowerCase().replace("_", "-"),
    label: STANDING[s].label,
    predicate: (p: PackPurchase) => p.standing === s,
}));

/**
 * Who holds which pack: classes left, when it runs out, and the invoice it
 * was sold with. The balance is the API's — classes sold less the ones spent
 * and not given back — so this list and a booking never disagree.
 */
export function PurchasesScreen({
    purchases,
    packs,
    contacts,
    canWrite,
    invoicesOnSale,
    initialFilterId,
}: {
    purchases: PackPurchase[];
    packs: ClassPack[];
    contacts: ContactOption[];
    canWrite: boolean;
    invoicesOnSale: boolean;
    initialFilterId?: string;
}) {
    const router = useRouter();
    const [selling, setSelling] = useState(false);

    const columns: DataColumn<PackPurchase>[] = [
        {
            id: "who",
            header: "Who",
            priority: "primary",
            sortValue: (p) => p.contact.name.toLowerCase(),
            cell: (p) => (
                <span className="block min-w-0">
                    <span className="block truncate font-medium">
                        {p.contact.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                        {p.contact.email}
                    </span>
                </span>
            ),
        },
        {
            id: "pack",
            header: "Pack",
            priority: "secondary",
            sortValue: (p) => p.pack.name.toLowerCase(),
            cell: (p) => <span className="block truncate">{p.pack.name}</span>,
        },
        {
            id: "left",
            header: "Classes left",
            priority: "secondary",
            width: "130px",
            sortValue: (p) => (p.standing === "ACTIVE" ? p.left : -1),
            cell: (p) =>
                p.standing === "ACTIVE" ? (
                    <Badge variant="success">
                        {p.left} of {p.credits} left
                    </Badge>
                ) : (
                    <Badge variant={STANDING[p.standing].variant}>
                        {STANDING[p.standing].label}
                    </Badge>
                ),
        },
        {
            id: "expires",
            header: "Expires",
            priority: "detail",
            width: "124px",
            sortValue: (p) => p.expiresAt,
            cell: (p) => <ViewerDate iso={p.expiresAt} />,
        },
        {
            id: "price",
            header: "Paid",
            priority: "detail",
            numeric: true,
            money: true,
            width: "118px",
            sortValue: (p) => Number(p.price),
            cell: (p) => invoiceMoney(p.price, p.currency),
        },
        {
            id: "invoice",
            header: "Invoice",
            priority: "detail",
            width: "96px",
            cell: (p) =>
                p.invoiceId ? (
                    <Link
                        href={`/billing/invoices/${p.invoiceId}`}
                        className="text-[12.5px] font-medium underline underline-offset-4"
                    >
                        Open
                    </Link>
                ) : (
                    <span className="text-[12.5px] text-muted-foreground">
                        None
                    </span>
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
                        <Button onClick={() => setSelling(true)}>
                            Sell a pack
                        </Button>
                    ) : undefined
                }
            />
            <ClassPacksTabs current="holders" />
            <DataView
                viewId="class-pack-purchases"
                rows={purchases}
                columns={columns}
                rowKey={(p) => p.id}
                rowHref={(p) => `/contacts/${p.contact.id}`}
                modes={["table", "list"]}
                hideModeToggle
                filters={FILTERS}
                initialFilterId={initialFilterId}
                noun={{ one: "pack sold", other: "packs sold" }}
                searchPlaceholder="Search people or packs"
                searchableColumnIds={["who", "pack"]}
                emptyState={{
                    icon: <Ticket />,
                    title: "Nobody holds a pack yet",
                    note: "Sell someone a pack and it shows here with the classes they have left and when it runs out.",
                    action: canWrite ? (
                        <Button onClick={() => setSelling(true)}>
                            Sell a pack
                        </Button>
                    ) : undefined,
                }}
            />
            {canWrite && selling ? (
                <SellPackDialog
                    open
                    onOpenChange={(o) => {
                        if (!o) {
                            setSelling(false);
                            router.refresh();
                        }
                    }}
                    contacts={contacts}
                    packs={packs}
                    invoicesOnSale={invoicesOnSale}
                />
            ) : null}
        </>
    );
}
