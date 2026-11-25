import { CalendarContainer } from "@/components/calendar/calendar-container";
import {
    CalendarLocked,
    CalendarNothing,
} from "@/components/calendar/calendar-nothing";
import { PageContainer } from "@/components/shared/page/page-container";
import { calendarCan, lockedFor } from "@/lib/calendar/access";
import { monthNow, todayIn } from "@/lib/calendar/service";
import { businessZone } from "@/lib/format/business-zone";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Business calendar" };

/**
 * Home › Calendar (U17, the "Saroh Business Calendar" design): one month of
 * everything dated — orders, pick-ups, renewals, invoices, bookings and
 * classes — read from the records themselves; nothing is entered here.
 *
 * `?month=YYYY-MM` picks the month, so a month can be linked to. Without it,
 * this month in the business's own zone (`businessZone`, from the business
 * list the shell already read). A month before the business joined, or
 * past what can be planned, opens the nearest one the calendar reaches
 * (E21): the API refuses it and names that month (E20), and the container
 * moves there in place.
 * `?day=YYYY-MM-DD` opens it on that day: a key in the grid that moves past
 * the month's edge asks for it (E28). `?team=<staff id>` opens it on one
 * person's bookings and classes (E24), for a viewer the team is named to.
 * `?view=week` opens the Week (E25) holding `?day=`, or this week: Monday
 * to Sunday in one read, pulled inside the range the same way.
 *
 * On React Query (DEC-259), loaded in the browser: the gates are awaited
 * here; the container reads the month or week, the first and every later
 * one, from the address in place (`calendar-container.tsx`); the first
 * time its toolbar is drawn at once and the grid waits as a skeleton.
 *
 * A role that reads none of the layers is told so before anything is read,
 * and again if the API refuses it (E20's 403).
 */
export default async function CalendarPage() {
    await requireSession();
    const organization = await resolveActiveOrganization();
    if (lockedFor(organization)) return <CalendarLocked />;
    if (!organization) {
        return (
            <PageContainer width="full">
                <CalendarNothing />
            </PageContainer>
        );
    }
    const zone = businessZone(organization);
    return (
        <CalendarContainer
            now={{ today: todayIn(zone), thisMonth: monthNow(zone) }}
            can={calendarCan(organization)}
        />
    );
}
