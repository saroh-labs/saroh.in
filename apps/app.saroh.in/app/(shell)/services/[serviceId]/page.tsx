import { ServiceEditorState } from "@/components/services/service-editor/editor-states";
import { ServiceEditor } from "@/components/services/service-editor/service-editor";
import { rowLock } from "@/lib/billing/access";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { loadEditorContext } from "@/lib/services/editor-data";
import { listRules, readService } from "@/lib/services/service";
import { readServiceUsage } from "@/lib/services/usage-read";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Service" };

/**
 * Bookings › Services › a service (E2): the Service Editor. It opens from
 * Edit (or View) on a service's card and from the calendar's links. Its own
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
        readService(serviceId),
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
            canEdit={canEdit}
            hasPage={hasPage}
            hasStorefront={hasStorefront}
            paymentsLock={rowLock(access, "payments")}
            payment={payment}
        />
    );
}
