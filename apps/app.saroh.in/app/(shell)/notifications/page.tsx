import { PageHeader } from "@saroh/ui/page-header";

import { NotificationsContainer } from "@/components/notifications/notifications-container";
import { PageContainer } from "@/components/shared/page/page-container";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

/**
 * Workspace → Notifications: every new enquiry and piece of activity lands
 * here as a durable in-app notification (S3-006). Reads the active business's
 * notifications through the API (membership + `notification:read` enforced
 * there) and hands them to the client list for mark-read. A Member reads
 * only the alerts addressed to them (`notification:read-own`, DEC-170):
 * the API decides which rows each person gets.
 *
 * On React Query (DEC-259), loaded in the browser: the page awaits the
 * session and the business (its name, for the empty state) and draws the
 * header at once; the inbox (`/api/notifications`, a live read) is
 * `NotificationsContainer`'s query. A mark-read reads the inbox and the
 * shell's live read (the bell) again; nothing is drawn on the server again.
 *
 * A page title is how a merchant with six tabs open finds this one.
 */
export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
    await requireSession();

    const organization = await resolveActiveOrganization();

    return (
        <PageContainer width="full">
            <PageHeader breadcrumb={["Notifications"]} title="Notifications" />
            <NotificationsContainer
                businessName={organization?.name ?? "this business"}
                // The instant "5 min ago" is counted from, the same on the
                // server and in the browser's first paint.
                now={new Date().toISOString()}
            />
        </PageContainer>
    );
}
