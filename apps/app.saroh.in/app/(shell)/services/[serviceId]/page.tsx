import { cache } from "react";

import { ServiceEditorState } from "@/components/services/service-editor/editor-states";
import { ServiceEditor } from "@/components/services/service-editor/service-editor";
import { rowLock } from "@/lib/billing/access";
import { recordTitle } from "@/lib/page-title";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { loadEditorContext } from "@/lib/services/editor-data";
import { listRules, readService } from "@/lib/services/service";
import { readServiceUsage } from "@/lib/services/usage-read";
import { requireSession } from "@/lib/session";

// One read for the tab's title and the page.
const readOne = cache((serviceId: string) => readService(serviceId));

/** The service's own name in the tab; "Service" when it can't be read. */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ serviceId: string }>;
}) {
    const { serviceId } = await params;
    return recordTitle(
        async () => {
            const read = await readOne(serviceId);
            return read.ok ? read.service : null;
        },
        (service) => service.name,
        "Service",
    );
}

/**
 * Bookings › Services › a service (E2): the Service Editor. It opens from
 * a service's row on Bookings › Services and from the calendar's links. Its own
 * weekly hours, who takes it and how it is booked each degrade on their
 * own; a service that can't be read says so rather than "isn't here".
 */
export default async function ServiceEditorPage({
    params,
}: {
    params: Promise<{ serviceId: string }>;
}) {
    const { serviceId } = await params;
    await requireSession();

    const [read, context, rules, access] = await Promise.all([
        readOne(serviceId),
        loadEditorContext(),
        listRules(serviceId),
        // Deposits are taken online: locked on a plan without it.
        billingAccessOrNull(),
    ]);
    if (!read.ok) {
        return (
            <ServiceEditorState
                state={read.reason}
                retryHref={`/services/${serviceId}`}
            />
        );
    }
    if (!context.ok) {
        return (
            <ServiceEditorState
                state={context.forbidden ? "forbidden" : "failed"}
                retryHref={`/services/${serviceId}`}
            />
        );
    }
    const service = read.service;
    const {
        staff,
        hasPage,
        hasStorefront,
        payment,
        gstRegistered,
        businessPriceMode,
        canEdit,
        timezone,
        currency,
    } = context.context;
    const usage = await readServiceUsage([service.id], timezone);

    return (
        <ServiceEditor
            // A different service starts from its own saved values.
            key={service.id}
            service={service}
            rules={rules}
            staff={staff?.staff ?? null}
            usage={usage?.[service.id] ?? null}
            currency={service.currency ?? currency}
            timezone={timezone}
            openingHours={staff?.openingHours ?? null}
            canEdit={canEdit}
            hasPage={hasPage}
            hasStorefront={hasStorefront}
            paymentsLock={rowLock(access, "payments")}
            payment={payment}
            gstRegistered={gstRegistered}
            businessPriceMode={businessPriceMode}
        />
    );
}
