import { z } from "zod";

import type { PlanLock } from "@/lib/billing/access";
import type { MeetSetup } from "@/lib/google-calendar/types";
import type { MissingRates } from "@/lib/gst-rates/missing";
import type { GstPriceMode } from "@/lib/gst/price-mode";
import type { ModuleView } from "@/lib/modules/schema";
import type { PriceHistoryPage } from "@/lib/price-history/words";
import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";
import type { ShareSetup } from "@/lib/share-item/share";
import type {
    BookingPaymentView,
    StaffView,
    WeeklyRange,
} from "@/lib/staff/types";

import type { AlsoSellFeature } from "./also-sell";
import type { BookingLinkView } from "./booking-link";
import type { AvailabilityRule, Service } from "./service";
import type { ServiceUsage } from "./usage";

/**
 * Services' reads (DEC-259): the list, the editor's context for New
 * service, and one service with that context. Client-safe: the keys and
 * the routes; the services are paired in `access-server.ts`. All tier
 * `settings`: services change through their own saves, which read them
 * again (`useServiceSave`).
 */

/** Every Services read of a business: what a service save invalidates. */
export const servicesKeys = (orgId: string): DomainKey =>
    domainKey("services", orgId);

/**
 * A person on the diary as the Services screens draw them: who they are
 * and what they take. Never their login, email, hours or time off.
 */
export type ServicePerson = Pick<
    StaffView,
    "id" | "name" | "title" | "status" | "serviceIds"
>;

/** Bookings › Services, as the list draws it. */
export interface ServicesScreenView {
    services: Service[];
    /** Null when the staff read failed. */
    staff: ServicePerson[] | null;
    /** Null when the bookings read failed. */
    usage: Record<string, ServiceUsage> | null;
    currency: string;
    /** Whether the business has a booking page; null when unknown. */
    hasPage: boolean | null;
    payment: BookingPaymentView | null;
    /** Courses and Class packs, on or off; null for no row. */
    alsoSell: AlsoSellFeature[] | null;
    /** Every module, for what "Also sell" brings when it turns one on. */
    modules: ModuleView[];
    missingRates: MissingRates | null;
    /** Courses is on and this role may add one: New service is a menu. */
    canNewCourse: boolean;
    bookingLink: BookingLinkView | null;
    shareSetup: ShareSetup | null;
}

export const servicesListRead = defineRead<ServicesScreenView>()({
    key: (orgId) => domainKey("services", orgId, "list"),
    route: { path: "/api/services", params: {} },
    // Changed only by Services' own saves and "Also sell", which read it
    // again (a module switch through `afterSettingsSave`).
    tier: "settings",
});

/** What the Service Editor reads beside a service (`EditorContext`). */
export interface ServiceEditorContext {
    /** The business's services, for a name another already has. */
    others: { id: string; name: string }[];
    staff: ServicePerson[] | null;
    openingHours: WeeklyRange[] | null;
    hasPage: boolean | null;
    hasStorefront: boolean | null;
    payment: BookingPaymentView | null;
    gstRegistered: boolean | null;
    businessPriceMode: GstPriceMode | null;
    timezone: string;
    currency: string;
    /** The plan's lock on online payments: deposits are taken online. */
    paymentsLock: PlanLock | null;
    meet: MeetSetup | null;
}

/** New service: the editor's context alone. */
export const serviceEditorRead = defineRead<ServiceEditorContext>()({
    key: (orgId) => domainKey("services", orgId, "editor"),
    route: { path: "/api/services/editor", params: {} },
    tier: "settings",
});

const ID = z.string().regex(/^[\w-]{1,64}$/);

/** One service's page: the service, its own hours, how it is used, and the editor's context. */
export interface ServiceView {
    service: Service;
    /** Null when its own hours couldn't be read. */
    rules: AvailabilityRule[] | null;
    usage: ServiceUsage | null;
    /** Null when that read failed. */
    priceHistory: PriceHistoryPage | null;
    /** The live booking page and site, for Share as a post; null when not live. */
    share: { setup: ShareSetup; bookUrl: string } | null;
    context: ServiceEditorContext;
}

export const serviceRead = defineRead<ServiceView>()({
    key: (orgId, { serviceId }) =>
        domainKey("services", orgId, "service", serviceId),
    route: {
        path: "/api/services/[serviceId]",
        params: { serviceId: ID },
    },
    tier: "settings",
});

export type ServiceAsk = Parameters<typeof serviceRead.options>[1];
