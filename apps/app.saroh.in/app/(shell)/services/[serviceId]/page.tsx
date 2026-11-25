import { cache } from "react";

import { ServiceEditorState } from "@/components/services/service-editor/editor-states";
import { ServiceContainer } from "@/components/services/service-editor/service-container";
import { recordTitle } from "@/lib/page-title";
import { readCanEditServices } from "@/lib/services/editor-data";
import { readService } from "@/lib/services/service";
import { requireSession } from "@/lib/session";

import Loading from "./loading";

// One read for the tab's title and the page's gate.
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
 * a service's row on Bookings › Services and from the calendar's links.
 *
 * On React Query (DEC-259): the page's gates are the service the tab's
 * title reads anyway (missing, forbidden or failed each say so, never
 * "isn't here" for a failure) and `service:write`; the service, its own
 * hours, how it is used, its price history and the editor's context are
 * `ServiceContainer`'s one read (`/api/services/[serviceId]`), behind the
 * route's loader.
 */
export default async function ServiceEditorPage({
    params,
}: {
    params: Promise<{ serviceId: string }>;
}) {
    const { serviceId } = await params;
    await requireSession();
    const [read, canEdit] = await Promise.all([
        readOne(serviceId),
        readCanEditServices(),
    ]);
    if (!read.ok) {
        return (
            <ServiceEditorState
                state={read.reason}
                retryHref={`/services/${serviceId}`}
            />
        );
    }
    return (
        <ServiceContainer
            serviceId={serviceId}
            canEdit={canEdit}
            skeleton={<Loading />}
        />
    );
}
