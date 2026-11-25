import "server-only";

import { ApiError } from "@/lib/api/errors";
import { rowLock } from "@/lib/billing/access";
import { canWriteCourses } from "@/lib/courses/access";
import { DEFAULT_BUSINESS_ZONE } from "@/lib/format/business-zone";
import { readMeetSetup } from "@/lib/google-calendar/meet-setup";
import { readMissingRates } from "@/lib/gst-rates/service";
import { moduleAccess, modulesOrUnknown } from "@/lib/modules/guard";
import { rolledOut } from "@/lib/modules/rollout";
import { permits } from "@/lib/organizations/permits";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { startingCurrency } from "@/lib/organizations/starting-currency";
import { readPriceHistory } from "@/lib/price-history/service";
import type { ServerRead } from "@/lib/query/route";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { readShareSetup } from "@/lib/share-item/read";
import { readWebAddressLinks } from "@/lib/sites/share-links-read";
import { readBookingPayment } from "@/lib/staff/service";
import type { StaffView } from "@/lib/staff/types";

import { canReadServices } from "./access";
import { alsoSellFeatures } from "./also-sell";
import { readBookingLink } from "./booking-link-read";
import {
    businessCurrencyOf,
    loadEditorContext,
    readHasBookingPage,
    readStaffOrNull,
} from "./editor-data";
import type {
    ServiceAsk,
    ServiceEditorContext,
    ServicePerson,
    ServicesScreenView,
    ServiceView,
} from "./queries";
import { serviceEditorRead, serviceRead, servicesListRead } from "./queries";
import { listRules, readService, readServices } from "./service";
import { readServiceUsage } from "./usage-read";

type NoAsk = Parameters<typeof servicesListRead.options>[1];

/**
 * Services' reads on the server (DEC-259): what `/api/services/*` answer
 * with, behind the pages' own gate.
 */

/** The section's gate, asked again for a read: `service:read` while Bookings is on. */
export async function mayReadServices(): Promise<boolean> {
    if (!canReadServices(await activeOrganizationOnce())) return false;
    const access = await moduleAccess("APPOINTMENTS");
    return access.state === "available" || access.state === "unknown";
}

/**
 * A person as the screens draw them, field by field: their login, email,
 * hours and time off never reach the browser or its cache.
 */
export function personFacts(p: StaffView): ServicePerson {
    return {
        id: p.id,
        name: p.name,
        title: p.title,
        status: p.status,
        serviceIds: p.serviceIds,
    };
}

/** The services list could not be read: forbidden is the role's, else a failure. */
function servicesFailed(forbidden: boolean): never {
    throw new ApiError(forbidden ? 403 : 503, "/services");
}

/** Bookings › Services: the services and what each side read could tell. */
export async function readServicesScreen(): Promise<ServicesScreenView> {
    const [
        read,
        staffList,
        hasPage,
        modules,
        payment,
        missingRates,
        organization,
        bookingLink,
    ] = await Promise.all([
        readServices(),
        readStaffOrNull(),
        readHasBookingPage(),
        modulesOrUnknown(),
        readBookingPayment(),
        // What is on sale with no GST rate; null draws no notice.
        readMissingRates(),
        activeOrganizationOnce(),
        // "Your booking page" (DEC-175); null leaves the row out.
        readBookingLink(),
    ]);
    if (!read.ok) servicesFailed(read.forbidden);
    const services = read.services;
    const timezone =
        staffList?.timezone ??
        services.at(0)?.timezone ??
        DEFAULT_BUSINESS_ZONE;
    const [usage, shareSetup, currency] = await Promise.all([
        readServiceUsage(
            services.map((s) => s.id),
            timezone,
        ),
        // Share as a post (#1375): the booking page's card, while it is
        // live, for whoever may see posts.
        bookingLink?.state === "live" && permits(organization, "social:read")
            ? readWebAddressLinks().then(readShareSetup)
            : null,
        services.some((s) => s.currency)
            ? businessCurrencyOf(services)
            : startingCurrency(),
    ]);
    return {
        services,
        staff: staffList ? staffList.staff.map(personFacts) : null,
        usage,
        currency,
        hasPage,
        payment,
        alsoSell: alsoSellFeatures(modules),
        modules: modules ?? [],
        missingRates,
        // New course joins New service only while Courses is on here and
        // this role may add one: the same answers the Courses screen gives.
        canNewCourse:
            canWriteCourses(organization) &&
            rolledOut(modules ?? []).some(
                (m) => m.key === "COURSES" && m.lifecycle === "ENABLED",
            ),
        bookingLink,
        shareSetup,
    };
}

/** The Service Editor's context, as New service and a service's page read it. */
export async function readEditorContext(): Promise<ServiceEditorContext> {
    const [read, access, meet] = await Promise.all([
        loadEditorContext(),
        // Deposits are taken online: locked on a plan without it.
        billingAccessOrNull(),
        readMeetSetup(),
    ]);
    if (!read.ok) servicesFailed(read.forbidden);
    const c = read.context;
    return {
        others: c.services.map((s) => ({ id: s.id, name: s.name })),
        staff: c.staff ? c.staff.staff.map(personFacts) : null,
        openingHours: c.staff?.openingHours ?? null,
        hasPage: c.hasPage,
        hasStorefront: c.hasStorefront,
        payment: c.payment,
        gstRegistered: c.gstRegistered,
        businessPriceMode: c.businessPriceMode,
        timezone: c.timezone,
        currency: c.currency,
        paymentsLock: rowLock(access, "payments"),
        meet,
    };
}

/** One service's page; null (a 404): no such service in this business. */
export async function readServiceView({
    serviceId,
}: ServiceAsk): Promise<ServiceView | null> {
    const [read, context, rules, priceHistory, web] = await Promise.all([
        readService(serviceId),
        readEditorContext(),
        listRules(serviceId),
        // What it has cost (12 Oct 2026); a read that fails is said in its place.
        readPriceHistory("services", serviceId).catch(() => null),
        // Share as a post (#1375): the booking page's live address.
        readWebAddressLinks(),
    ]);
    if (!read.ok) {
        if (read.reason === "missing") return null;
        servicesFailed(read.reason === "forbidden");
    }
    const service = read.service;
    const bookUrl = web?.links.book ?? null;
    const [usage, setup] = await Promise.all([
        readServiceUsage([service.id], context.timezone),
        bookUrl ? readShareSetup(web) : null,
    ]);
    return {
        service,
        rules,
        usage: usage?.[service.id] ?? null,
        priceHistory,
        share: setup && bookUrl ? { setup, bookUrl } : null,
        context: {
            ...context,
            currency: service.currency ?? context.currency,
        },
    };
}

export const servicesListServer: ServerRead<NoAsk, ServicesScreenView> = {
    read: servicesListRead,
    service: readServicesScreen,
};

export const serviceEditorServer: ServerRead<NoAsk, ServiceEditorContext> = {
    read: serviceEditorRead,
    service: readEditorContext,
};

export const serviceServer: ServerRead<ServiceAsk, ServiceView> = {
    read: serviceRead,
    service: readServiceView,
};
