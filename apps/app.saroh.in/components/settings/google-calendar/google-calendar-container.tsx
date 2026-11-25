"use client";

import { PermissionDeniedState } from "@saroh/ui/data-state";
import { Notice } from "@saroh/ui/notice";
import { notFound } from "next/navigation";

import { PlanLockedCard } from "@/components/billing/plan-way";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/page/settings-panel";
import { PageLoading } from "@/components/shared/page/page-loading";
import { whoCanChange } from "@/components/shared/states/who-can-change";
import { upgradeHref } from "@/lib/billing/access";
import { useGoogleCalendarScreen } from "@/lib/google-calendar/use-google-calendar";
import { GC_WORDS } from "@/lib/google-calendar/words";
import { ReadFailed } from "@/lib/query/client";
import { plansShown } from "@/lib/saroh-billing/plans-shown";

import { GoogleCalendarScreen } from "./google-calendar-screen";

const NARROW = "max-w-[760px]";

/**
 * Settings › Integrations › Google Calendar on React Query (DEC-259): the
 * header at once, from the page's gate, then what the API says
 * (`/api/settings/integrations/google-calendar`): the person's accounts, or
 * why they can't connect (the role, the plan, the diary, a server with no
 * Google), each in its own words. Switched off is the page's not-found; a
 * failed read is the tab's boundary ("Couldn't load your Google Calendar").
 */
export function GoogleCalendarContainer({
    business,
    outcome,
    mayMeetAccess,
}: {
    /** The business's name, or null when none resolved. */
    business: string | null;
    /** What came back from Google's consent (`?calendar=`), said once. */
    outcome: string | null;
    mayMeetAccess: boolean;
}) {
    const query = useGoogleCalendarScreen();
    const read = query.data;
    if (query.isError && !read) {
        if (query.error instanceof ReadFailed && query.error.status === 404) {
            notFound();
        }
        throw query.error;
    }
    const header = (
        <SettingsPanelHeader
            holdsData={false}
            parent={{ label: "Integrations", href: "/settings/integrations" }}
            title={GC_WORDS.title}
            description={GC_WORDS.description(business ?? "this business")}
        />
    );
    return (
        <SettingsPanel header={header}>
            {!read ? (
                <PageLoading
                    shape="settings"
                    width="full"
                    rows={3}
                    label="Loading Google Calendar"
                    bare
                />
            ) : read.kind === "denied" ? (
                <PermissionDeniedState
                    className={NARROW}
                    {...whoCanChange({
                        thing: "Google Calendar",
                        business: business ?? undefined,
                    })}
                />
            ) : read.kind === "plan" ? (
                <>
                    {/* No plans shown (Global, DEC-136): the card draws nothing, so say it (S11). */}
                    {!plansShown() ? (
                        <Notice className={NARROW} title="Not on your plan">
                            Google Calendar isn&apos;t on Saroh&apos;s plans
                            here yet.
                        </Notice>
                    ) : null}
                    <PlanLockedCard
                        className={NARROW}
                        name="Google Calendar"
                        plan={read.upgradeTo?.name}
                        href={upgradeHref(read.upgradeTo?.planId)}
                    />
                </>
            ) : read.kind === "off-diary" ? (
                <Notice className={NARROW} title="You're not on the diary">
                    {read.message} Bookings › Hours adds you.
                </Notice>
            ) : read.kind === "unavailable" ? (
                <Notice className={NARROW} title="Can't connect yet">
                    {read.message}
                </Notice>
            ) : (
                <GoogleCalendarScreen
                    status={read.status}
                    outcome={outcome}
                    morePlan={read.morePlan}
                    mayMeetAccess={mayMeetAccess}
                />
            )}
        </SettingsPanel>
    );
}
