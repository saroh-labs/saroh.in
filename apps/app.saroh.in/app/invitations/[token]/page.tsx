import { Button } from "@saroh/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@saroh/ui/card";
import Link from "next/link";
import { redirect } from "next/navigation";

import { acceptInvitation } from "@/lib/members/service";
import { requireSession } from "@/lib/session";

/**
 * Accept a store invitation. Requires a session (requireSession bounces an
 * unauthenticated visitor to accounts sign-in — they can re-open the email
 * link once signed in). The api enforces that the session email matches the
 * invited email; on success we redirect into the store, otherwise we show why.
 */
export default async function AcceptInvitationPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    await requireSession();

    const result = await acceptInvitation(token);
    if (result.ok) {
        redirect(`/stores/${result.storeId}`);
    }

    return (
        <main className="mx-auto flex min-h-[60vh] max-w-md items-center p-8">
            <Card className="w-full">
                <CardHeader>
                    <CardTitle>Invitation problem</CardTitle>
                    <CardDescription>{result.error}</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="mb-4 text-sm text-muted-foreground">
                        If this invitation was sent to a different email, sign
                        in with that account and open the link again.
                    </p>
                    <Button asChild>
                        <Link href="/">Go to your stores</Link>
                    </Button>
                </CardContent>
            </Card>
        </main>
    );
}
