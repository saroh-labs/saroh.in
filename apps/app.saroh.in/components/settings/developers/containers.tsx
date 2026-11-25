"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { PageLoading } from "@/components/shared/page/page-loading";
import { SectionError } from "@/components/shared/states/section-error";
import { useAiAppsScreen } from "@/lib/ai-connections/use-ai-connections";
import { useKeysScreen, useUsageScreen } from "@/lib/api-keys/use-api-keys";
import { upgradeHref } from "@/lib/billing/access";
import { useAskAiSettings } from "@/lib/settings/use-ask-ai-settings";
import { useWebhooksScreen } from "@/lib/webhooks/use-webhooks";

import type { AiAppsProps } from "./ai-apps";
import { AiApps } from "./ai-apps";
import { AskAiSettingsView } from "./ask-ai-settings";
import type { KeysProps } from "./keys";
import { Keys } from "./keys";
import { DevelopersLocked } from "./locked";
import { Usage } from "./usage";
import type { WebhooksProps } from "./webhooks";
import { Webhooks } from "./webhooks";

/**
 * API and AI apps' tabs on React Query (DEC-259): each page checks its
 * gate (switch, permission, plan) and hands what it decided to one of
 * these; the tab's rows load in the browser. Under the layout's header and
 * tabs, the loader's own piece stands where the rows go, and a failed read
 * costs only this tab, as `error.tsx` had it. A key's token or a webhook's
 * secret is never read: each is shown once from its action's own answer.
 */
function Tab<T>({
    query,
    children,
}: {
    query: UseQueryResult<T>;
    children: (data: T) => ReactNode;
}) {
    if (query.data !== undefined) return children(query.data);
    if (query.isError) {
        return (
            <SectionError
                error={query.error}
                retry={() => void query.refetch()}
                heading="API and AI apps"
                things="this tab"
                reassurance="Your keys, connections and addresses are all still there."
                backHref="/settings"
                place="Settings"
            />
        );
    }
    return (
        <PageLoading shape="list" width="full" label="Loading this tab" bare />
    );
}

export function AiAppsContainer(props: Omit<AiAppsProps, "connections">) {
    return (
        <Tab query={useAiAppsScreen()}>
            {({ connections }) => (
                <AiApps {...props} connections={connections} />
            )}
        </Tab>
    );
}

export function AskAiContainer({
    business,
    beforePaidPlans,
}: {
    business: string;
    beforePaidPlans: boolean;
}) {
    return (
        <Tab query={useAskAiSettings()}>
            {({ state, usage, people }) =>
                state?.reason === "locked" ? (
                    <DevelopersLocked
                        name="Ask AI"
                        what={`Ask questions about ${business} and get answers inside Saroh.`}
                        // "" (no plan has it) reads as none there.
                        plan={state.upgradeTo}
                        href={upgradeHref()}
                        beforePaidPlans={beforePaidPlans}
                    />
                ) : (
                    <AskAiSettingsView
                        business={business}
                        state={state}
                        usage={usage}
                        people={people}
                    />
                )
            }
        </Tab>
    );
}

/** `open` and `cap` are the page's gate; the count is the keys that work. */
export function KeysContainer(props: Omit<KeysProps, "keys" | "count">) {
    return (
        <Tab query={useKeysScreen()}>
            {({ keys }) => <Keys {...props} keys={keys} count={keys.length} />}
        </Tab>
    );
}

/** `cap` is the page's gate; the count is the addresses there are. */
export function WebhooksContainer(
    props: Omit<WebhooksProps, "endpoints" | "count">,
) {
    return (
        <Tab query={useWebhooksScreen()}>
            {({ endpoints }) => (
                <Webhooks
                    {...props}
                    endpoints={endpoints}
                    count={endpoints.length}
                />
            )}
        </Tab>
    );
}

export function UsageContainer({ zone }: { zone: string }) {
    return (
        <Tab query={useUsageScreen()}>
            {(read) => <Usage {...read} zone={zone} />}
        </Tab>
    );
}
