import { redirect } from "next/navigation";

/**
 * `/appointments` now sends you to the schedule.
 *
 * It used to be an operations hub (#121, Task 6): a page of link cards pointing
 * at Schedule, Services and "Availability", plus two count tiles. Every one of
 * those destinations was already a line in the sidebar directly beneath it, and
 * two of the three cards — Services and Availability — linked to the SAME route,
 * so a merchant clicking "Availability" landed somewhere that never mentions the
 * word. A menu that duplicates the navigation and misroutes a third of itself is
 * a place, not work.
 *
 * The counts it carried now live on Home, where the workspace's numbers belong.
 * The route is kept rather than deleted so bookmarks — and any link sent to a
 * merchant before today — still resolve.
 */
export default function AppointmentsPage() {
    redirect("/bookings");
}
