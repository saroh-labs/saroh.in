import { z } from "zod";

import type { SellablePack } from "@/components/class-packs/list/sell-pack-dialog";
import type { ContactOption } from "@/components/shared/fields/contact-picker";
import type { GstAsk } from "@/lib/gst/item-words";
import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";

import type { CardNote } from "./pack-card-notes";
import type { PackListItem } from "./pack-cards";
import type {
    PackDetail,
    PackEventsPage,
    PackHolder,
    PackSale,
    PackUsedPage,
    PartRead,
} from "./pack-detail-data";
import type { DropIn, ReceiptSource } from "./pack-overview";
import type { MembershipPlan } from "./packs-page";
import type { HeldPack } from "./sell-words";
import type { ClassPack, PackPurchase } from "./service";

/**
 * Class packs' reads (DEC-259): the Packs list, who holds one, and one
 * pack's page. Client-safe: the keys and the routes; the services are
 * paired in `access-server.ts`.
 */

/** Every Class packs read of a business: what a pack write invalidates. */
export const classPacksKeys = (orgId: string): DomainKey =>
    domainKey("class-packs", orgId);

/** Bookings › Packs: the cards, their notes and the sell dialog's reads. */
export interface PacksView {
    packs: PackListItem[];
    /** Each card's lines under its figures, by pack id. */
    notes: Record<string, CardNote[]>;
    /** Whom to sell to; empty for a role that can't sell. */
    contacts: ContactOption[];
    held: HeldPack[];
    invoicesOnSale: boolean;
    summary: string;
    rules: string;
    memberships: MembershipPlan[] | null;
}

export const packsListRead = defineRead<PacksView>()({
    key: (orgId) => domainKey("class-packs", orgId, "list"),
    route: { path: "/api/class-packs", params: {} },
    tier: "records",
});

/** Class packs › Who holds one, with the sell dialog's reads. */
export interface PurchasesView {
    purchases: PackPurchase[];
    packs: ClassPack[];
    /** Whom to sell to; empty for a role that can't sell. */
    contacts: ContactOption[];
    invoicesOnSale: boolean;
    gst: GstAsk;
}

export const packPurchasesRead = defineRead<PurchasesView>()({
    key: (orgId) => domainKey("class-packs", orgId, "purchases"),
    route: { path: "/api/class-packs/purchases", params: {} },
    tier: "records",
});

/** What the sell dialog needs, read only for someone who may sell. */
export interface SellContext {
    contacts: ContactOption[];
    held: HeldPack[];
    packs: SellablePack[];
    invoicesOnSale: boolean;
    gst?: GstAsk | null;
}

/** One pack's page: the pack and each tab's own read. */
export interface PackView {
    pack: PackDetail;
    holders: PartRead<PackHolder[]>;
    used: PartRead<PackUsedPage>;
    sales: PartRead<PackSale[]>;
    events: PartRead<PackEventsPage>;
    /** This person may open invoices and Payments is on: receipts link. */
    invoices: boolean;
    receipts: ReceiptSource[] | null;
    dropIns: DropIn[] | null;
    freeCancelHours: number | null | undefined;
    timeZone: string;
    sell: SellContext | null;
}

const ID = z.string().regex(/^[\w-]{1,64}$/);

export const packRead = defineRead<PackView>()({
    key: (orgId, { packId }) => domainKey("class-packs", orgId, "pack", packId),
    route: { path: "/api/class-packs/[packId]", params: { packId: ID } },
    tier: "records",
});

export type PackAsk = Parameters<typeof packRead.options>[1];
