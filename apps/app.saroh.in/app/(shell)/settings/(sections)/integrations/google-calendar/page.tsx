import { GoogleCalendarContainer } from "@/components/settings/google-calendar/google-calendar-container";
import { permits } from "@/lib/organizations/permits";
import { activeOrganizationOnce } from "@/lib/organizations/service";
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
 *
 * On React Query (DEC-259): the page checks the session and hands the
 * business's name, the outcome and the Meet permission to the container;
 * what the API says loads in the browser
 * (`/api/settings/integrations/google-calendar`). Off is still not-found,
 * a failed read still the tab's boundary, and each refusal keeps its words
 * (`GoogleCalendarContainer`), drawn in the tab's `SettingsPanel`.
 */
export const metadata = { title: "Google Calendar · Settings" };

export default async function GoogleCalendarSettingsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [org, q] = await Promise.all([
        activeOrganizationOnce(),
        searchParams,
    ]);
    return (
        <GoogleCalendarContainer
            business={org?.name ?? null}
            outcome={typeof q.calendar === "string" ? q.calendar : null}
            mayMeetAccess={permits(org, "service:write")}
        />
    );
}
