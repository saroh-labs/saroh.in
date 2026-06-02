import { getServerSession } from "@saroh/auth/next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import { accountsLoginUrl, isAdmin } from "@/lib/admin-access";

export default async function Home() {
    const session = await getServerSession(await headers());

    // Middleware already redirects unauthenticated users; this is defense in
    // depth in case the page is reached without the middleware gate.
    if (!session) redirect(accountsLoginUrl);

    if (!isAdmin(session)) {
        return (
            <main className="p-8">
                <h1 className="text-xl font-semibold">Not authorized</h1>
                <p className="text-muted-foreground mt-2 text-sm">
                    {session.user.email} does not have admin access.
                </p>
                <div className="mt-4">
                    <SignOutButton />
                </div>
            </main>
        );
    }

    return (
        <main className="p-8">
            <div className="mb-6 flex items-center justify-between">
                <span className="text-sm">
                    Signed in as {session.user.email}
                </span>
                <SignOutButton />
            </div>
            Admin App We will add the admin page components here Features like:
            <ul className="list-disc">
                <li>Member Management / User Management</li>
                <li>Dashboard Analytics</li>
                <li>Resource Management</li>
                <li>App Access</li>
            </ul>
        </main>
    );
}
