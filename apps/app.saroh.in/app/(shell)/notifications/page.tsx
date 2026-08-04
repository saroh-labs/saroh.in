import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { NotificationsInbox } from "@/components/notifications/notifications-inbox";
import { listNotifications } from "@/lib/notifications/service";
import { requireSession } from "@/lib/session";

/**
 * The owner/admin notification inbox (S3-006): every new enquiry lands here as a
 * durable in-app notification. Server component — reads the active org's
 * notifications through the API (membership + `notification:read` enforced
 * server-side) and hands them to the client inbox for mark-read interactions.
 */
/**
 * A page title is how a merchant with six tabs open finds this one.
 * Without it the tab reads the bare default, "Saroh", on every route.
 */
export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
    await requireSession();

    const notifications = await listNotifications();

    return (
        <main className="mx-auto max-w-5xl p-8">
            <PageHeader
                title="Notifications"
                description="New enquiries and activity across your organization."
                actions={
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/">Back to dashboard</Link>
                    </Button>
                }
            />

            <NotificationsInbox notifications={notifications} />
        </main>
    );
}
