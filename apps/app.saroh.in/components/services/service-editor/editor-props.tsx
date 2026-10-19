import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import type { PlanLock } from "@/lib/billing/access";
import type { GstPriceMode } from "@/lib/gst/price-mode";
import type { PriceHistoryPage } from "@/lib/price-history/words";
import type { AvailabilityRule, Service } from "@/lib/services/service";
import type { ServiceUsage } from "@/lib/services/usage";
import type {
    BookingPaymentView,
    StaffView,
    WeeklyRange,
} from "@/lib/staff/types";

/** What the Service Editor is handed, new or saved. */
export interface EditorProps {
    /**
     * What the service has cost, newest first (12 Oct 2026); null when
     * that read failed. Left out (a new service), or with nothing kept
     * yet, nothing is drawn.
     */
    priceHistory?: PriceHistoryPage | null;
    /**
     * How the business's prices carry GST (12 Oct 2026), for "Same as the
     * business (…)". Null when it couldn't be read.
     */
    businessPriceMode?: GstPriceMode | null;
    /**
     * Whether the business is GST-registered: its priced services need a
     * GST rate. False: nothing is asked. Null when it couldn't be told.
     */
    gstRegistered?: boolean | null;
    /** Null while creating. */
    service: Service | null;
    /** Null when the service's own hours couldn't be read. */
    rules: AvailabilityRule[] | null;
    /** Null when the people on the diary couldn't be read. */
    staff: StaffView[] | null;
    /** Null when the bookings couldn't be counted. */
    usage: ServiceUsage | null;
    /** The business's currency. */
    currency: string;
    /** The business's time zone. */
    timezone: string;
    /**
     * When the business is open: what a new service's own hours start
     * from. Null with none set, or when they couldn't be read.
     */
    openingHours?: WeeklyRange[] | null;
    canEdit: boolean;
    /** Whether the business has a booking page; null when unknown. */
    hasPage: boolean | null;
    /** A storefront to sell treatments from (E10); null when unknown. */
    hasStorefront?: boolean | null;
    /**
     * The plan's lock on online payments (`rowLock(…, "payments")`): a
     * deposit is taken online, so it locks the deposits. Null when open,
     * unknown or not enforced.
     */
    paymentsLock?: PlanLock | null;
    /** How people pay when they book (DEC-088); null when unknown. */
    payment?: BookingPaymentView | null;
    /** The business's services, for a name another already has. */
    others?: readonly { id: string; name: string }[];
}

export const SERVICES_HREF = "/services";

/** "‹ Services", over the page's title. */
export function BackToServices() {
    return (
        <Link
            href={SERVICES_HREF}
            className="mb-2 inline-flex items-center gap-1 rounded-sm text-[12.5px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
        >
            <ArrowLeft aria-hidden className="size-3.5" />
            Services
        </Link>
    );
}
