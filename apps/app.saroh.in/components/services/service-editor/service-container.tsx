"use client";

import type { ReactNode } from "react";

import { ReadFailed } from "@/lib/query/client";
import type { ServiceEditorContext } from "@/lib/services/queries";
import { useService, useServiceEditor } from "@/lib/services/use-services";

import type { EditorProps } from "./editor-props";
import { ServiceEditorState } from "./editor-states";
import { ServiceEditor } from "./service-editor";

/** What the editor is handed from its context, new or saved. */
function contextProps(c: ServiceEditorContext) {
    return {
        staff: c.staff,
        currency: c.currency,
        timezone: c.timezone,
        openingHours: c.openingHours,
        hasPage: c.hasPage,
        hasStorefront: c.hasStorefront,
        paymentsLock: c.paymentsLock,
        payment: c.payment,
        gstRegistered: c.gstRegistered,
        businessPriceMode: c.businessPriceMode,
        // A name another service already has says so, with the way to it.
        others: c.others,
        meet: c.meet,
    } satisfies Partial<EditorProps>;
}

/** A failed read as the editor says it: never "isn't here" for a failure. */
function stateOf(error: unknown): "missing" | "forbidden" | "failed" {
    if (error instanceof ReadFailed) {
        if (error.status === 404) return "missing";
        if (error.status === 403) return "forbidden";
    }
    return "failed";
}

/**
 * A service's page on React Query (DEC-259): its title, actions and cards
 * all come from the service, so the route's loader (`skeleton`) stands
 * until its one read lands. The editor keeps its own draft; a save reads
 * this again (`useServiceSave`), and a fresh read of the service wins
 * where the editor says so (`updatedAt`).
 */
export function ServiceContainer({
    serviceId,
    canEdit,
    skeleton,
}: {
    serviceId: string;
    canEdit: boolean;
    skeleton: ReactNode;
}) {
    const query = useService({ serviceId });
    const view = query.data;
    if (!view) {
        return query.isError ? (
            <ServiceEditorState
                state={stateOf(query.error)}
                retryHref={`/services/${serviceId}`}
            />
        ) : (
            skeleton
        );
    }
    return (
        <ServiceEditor
            // A different service starts from its own saved values.
            key={view.service.id}
            {...contextProps(view.context)}
            service={view.service}
            rules={view.rules}
            usage={view.usage}
            canEdit={canEdit}
            priceHistory={view.priceHistory}
            share={view.share}
        />
    );
}

/** New service on React Query: the editor, empty, once its context lands. */
export function NewServiceContainer({ skeleton }: { skeleton: ReactNode }) {
    const query = useServiceEditor();
    const context = query.data;
    if (!context) {
        return query.isError ? (
            <ServiceEditorState
                state={
                    stateOf(query.error) === "forbidden"
                        ? "forbidden"
                        : "failed"
                }
                retryHref="/services/new"
            />
        ) : (
            skeleton
        );
    }
    return (
        <ServiceEditor
            {...contextProps(context)}
            service={null}
            rules={[]}
            usage={{ thisWeek: 0, comingUp: 0 }}
            // Only a role that may add one reaches here (the page's gate).
            canEdit
        />
    );
}
