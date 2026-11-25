"use client";

import { useQuery } from "@tanstack/react-query";
import type { ComponentProps } from "react";

import { AskAiHost } from "@/components/ask-ai/ask-ai-host";
import { PausedBanner } from "@/components/billing/paused-banner";
import { PaymentDueBanner } from "@/components/billing/payment-due-banner";
import { PlanEndingBanner } from "@/components/billing/plan-ending-banner";
import { LiveRefresh } from "@/components/shared/live-refresh/live-refresh";
import { CommandMenu } from "@/components/shared/navigation/command-menu";
import { WebsiteAreaProvider } from "@/components/sites/website-area";
import { useOrgId } from "@/lib/query/org";
import { shellLiveRead, shellSettingsRead } from "@/lib/shell/queries";

import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { TabBar } from "./tab-bar";

/**
 * The shell's chrome, drawn from two browser reads (owner, 25 Nov 2026)
 * instead of a dozen server reads on every render: `/api/shell` (settings:
 * read once per load, again when a save changes it) and `/api/shell/live`
 * (the bell and the badges, on the live refresh). The server passes what
 * a gate already decided (the person, the business, the role); each piece
 * here adds what it reads. Until a read lands the frame is drawn and only
 * the parts that wait for it are skeleton pieces or left out: a badge, a
 * banner, the rail's rows.
 */

export function useShellSettings() {
    return useQuery(shellSettingsRead.options(useOrgId(), {})).data;
}

export function useShellLive() {
    return useQuery(shellLiveRead.options(useOrgId(), {})).data;
}

type NavProps = Pick<
    ComponentProps<typeof AppSidebar>,
    "role" | "roleKey" | "actions" | "kind"
>;

export function ShellSidebar(props: NavProps & { collapsed: boolean }) {
    const settings = useShellSettings();
    const live = useShellLive();
    return (
        <AppSidebar
            {...props}
            pending={!settings}
            moduleKeys={settings?.moduleKeys ?? null}
            locked={settings?.locked ?? []}
            stockTracked={settings?.stockTracked ?? null}
            storefronts={settings?.storefronts?.used ?? null}
            unread={live?.unread ?? 0}
            counts={live?.counts}
        />
    );
}

export function ShellTabBar(props: NavProps) {
    const settings = useShellSettings();
    const live = useShellLive();
    return (
        <TabBar
            {...props}
            pending={!settings}
            moduleKeys={settings?.moduleKeys ?? null}
            stockTracked={settings?.stockTracked ?? null}
            storefronts={settings?.storefronts?.used ?? null}
            unread={live?.unread ?? 0}
            counts={live?.counts}
        />
    );
}

export function ShellCommandMenu(
    props: Omit<
        ComponentProps<typeof CommandMenu>,
        "moduleKeys" | "sites" | "stockTracked" | "storefronts"
    >,
) {
    const settings = useShellSettings();
    return (
        <CommandMenu
            {...props}
            moduleKeys={settings?.moduleKeys ?? null}
            sites={settings?.sites ?? []}
            stockTracked={settings?.stockTracked ?? null}
            storefronts={settings?.storefronts ?? null}
        />
    );
}

/**
 * The top bar. `askAiShown` and `inbox` are the role's answers, known at
 * once; whether Ask AI is locked, and how many are unread, follow.
 */
export function ShellHeader({
    askAiShown,
    inbox,
    ...props
}: Omit<
    Extract<ComponentProps<typeof AppHeader>, { organizations: unknown }>,
    "unread" | "moduleKeys" | "accountManager" | "askAi"
> & { askAiShown: boolean; inbox: boolean }) {
    const settings = useShellSettings();
    const live = useShellLive();
    const state = settings?.askAi?.state;
    return (
        <AppHeader
            {...props}
            moduleKeys={settings?.moduleKeys ?? null}
            accountManager={settings?.accountManager ?? null}
            askAi={
                askAiShown && settings?.askAi !== null
                    ? {
                          locked: state?.reason === "locked",
                          upgradeTo: state?.upgradeTo ?? null,
                      }
                    : null
            }
            // The bell is the role's; its count lands with the live read.
            unread={inbox ? (live?.unread ?? 0) : null}
        />
    );
}

/** The live refresh, and the unread count in the tab's title. */
export function ShellLiveRefresh({ inbox }: { inbox: boolean }) {
    const live = useShellLive();
    return <LiveRefresh unread={inbox ? (live?.unread ?? 0) : null} />;
}

/** The plan banners, one plan message at a time, the payment due first. */
export function ShellPlanBanners() {
    const settings = useShellSettings();
    if (!settings) return null;
    return (
        <>
            <PaymentDueBanner due={settings.paymentDue ?? undefined} />
            {settings.paymentDue ? null : (
                <PlanEndingBanner ending={settings.planEnding ?? undefined} />
            )}
            <PausedBanner view={settings.paused} />
        </>
    );
}

export function ShellAskAi(
    props: Omit<ComponentProps<typeof AskAiHost>, "state">,
) {
    const settings = useShellSettings();
    if (settings?.askAi === null) return null;
    return <AskAiHost {...props} state={settings?.askAi?.state ?? null} />;
}

export function ShellWebsiteArea({ children }: { children: React.ReactNode }) {
    const settings = useShellSettings();
    return (
        <WebsiteAreaProvider on={settings?.websiteArea ?? false}>
            {children}
        </WebsiteAreaProvider>
    );
}
