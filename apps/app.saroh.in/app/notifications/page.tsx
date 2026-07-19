import { Button } from "@saroh/ui/button";
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
export default async function NotificationsPage() {
    await requireSession();

    const notifications = await listNotifications();

    return (
        <main className="mx-auto max-w-3xl p-8">
            <div className="mb-8 flex items-center justify-between gap-4">
                <h1 className="text-2xl font-semibold">Notifications</h1>
                <Button asChild variant="ghost" size="sm">
                    <Link href="/">Back to dashboard</Link>
                </Button>
            </div>

            <NotificationsInbox notifications={notifications} />
        </main>
    );
}
