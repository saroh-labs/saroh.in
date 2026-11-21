import { PermissionDeniedState } from "@saroh/ui/data-state";
import { Notice } from "@saroh/ui/notice";
import { notFound } from "next/navigation";

import { PlanLockedCard } from "@/components/billing/plan-way";
import { GoogleCalendarScreen } from "@/components/settings/google-calendar/google-calendar-screen";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/page/settings-panel";
import { whoCanChange } from "@/components/shared/states/who-can-change";
import { accessRow, upgradeHref } from "@/lib/billing/access";
import { readGoogleCalendar } from "@/lib/google-calendar/service";
import { GC_WORDS } from "@/lib/google-calendar/words";
import { permits } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { plansShown } from "@/lib/saroh-billing/plans-shown";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";

/**
 * Settings › Integrations › Google Calendar (#1047, boards GC2*, DEC-233;
 * under Providers since 20 Nov 2026): the person's
 * own Google accounts here, where their bookings go, and the business's
 * default for who may join a Meet. Google's consent sends them back here
 * with `?calendar=<outcome>`, said once at the top.
 *
 * Not there at all while the `GOOGLE_CALENDAR` switch is off (the API's
 * 404). The plan, the role and a server with no Google each say so.
 */
export const metadata = { title: "Google Calendar · Settings" };

export default async function GoogleCalendarSettingsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [read, org, q] = await Promise.all([
        readGoogleCalendar(),
        resolveActiveOrganization(),
        searchParams,
    ]);
    if (read.kind === "off") notFound();
    // Throws to the tab's boundary: "Couldn't load your Google Calendar".
    if (read.kind === "failed") {
        throw new Error("Google Calendar couldn't be read");
    }
    const business = org?.name ?? "this business";
    const header = (
        <SettingsPanelHeader
            holdsData={false}
            parent={{ label: "Integrations", href: "/settings/integrations" }}
            title={GC_WORDS.title}
            description={GC_WORDS.description(business)}
        />
    );
    if (read.kind === "denied") {
        return (
            <SettingsPanel header={header}>
                <PermissionDeniedState
                    className="max-w-[760px]"
                    {...whoCanChange({
                        thing: "Google Calendar",
                        business: org?.name,
                    })}
                />
            </SettingsPanel>
        );
    }
    if (read.kind === "plan") {
        return (
            <SettingsPanel header={header}>
                {/* No plans shown (Global, DEC-136): the card draws nothing, so say it (S11). */}
                {!plansShown() ? (
                    <Notice className="max-w-[760px]" title="Not on your plan">
                        Google Calendar isn&apos;t on Saroh&apos;s plans here
                        yet.
                    </Notice>
                ) : null}
                <PlanLockedCard
                    className="max-w-[760px]"
                    name="Google Calendar"
                    plan={read.upgradeTo?.name}
                    href={upgradeHref(read.upgradeTo?.planId)}
                />
            </SettingsPanel>
        );
    }
    if (read.kind === "off-diary") {
        return (
            <SettingsPanel header={header}>
                <Notice
                    className="max-w-[760px]"
                    title="You're not on the diary"
                >
                    {read.message} Bookings › Hours adds you.
                </Notice>
            </SettingsPanel>
        );
    }
    if (read.kind === "unavailable") {
        return (
            <SettingsPanel header={header}>
                <Notice className="max-w-[760px]" title="Can't connect yet">
                    {read.message}
                </Notice>
            </SettingsPanel>
        );
    }
    // Where more Google accounts come from, by name only (DEC-233).
    const access = await billingAccessOrNull();
    const more = accessRow(access, "google-accounts")?.upgradeTo ?? null;
    const outcome = typeof q.calendar === "string" ? q.calendar : null;
    return (
        <SettingsPanel header={header}>
            <GoogleCalendarScreen
                status={read.status}
                outcome={outcome}
                morePlan={
                    more
                        ? { name: more.name, href: upgradeHref(more.planId) }
                        : null
                }
                mayMeetAccess={permits(org, "service:write")}
            />
        </SettingsPanel>
    );
}
