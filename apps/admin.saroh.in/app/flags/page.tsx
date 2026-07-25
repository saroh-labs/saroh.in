import { getServerSession } from "@saroh/auth/next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { FlagCard } from "@/components/flag-card";
import { NotAuthorized } from "@/components/not-authorized";
import { accountsLoginUrl } from "@/lib/admin-access";
import {
    getStaffIdentity,
    listFlags,
    listOrganizations,
} from "@/lib/control-plane";

/**
 * Feature flags — the rollout control surface (S1-012, DEC feature-flags).
 *
 * This is the piece the module rollout runbook assumed existed: its shadow →
 * internal-org → beta → default-on sequence is entirely "set this flag for this
 * Organization", which until now meant hand-written SQL against a live
 * database. Precedence is override > global default > off, so an override is
 * the targeted-rollout lever and clearing it returns the org to the default.
 */
export const metadata = { title: "Feature flags" };

export default async function FlagsPage() {
    const session = await getServerSession(await headers());
    if (!session) redirect(accountsLoginUrl);

    const staff = await getStaffIdentity();
    if (!staff) return <NotAuthorized email={session.user.email} />;

    const [flags, organizations] = await Promise.all([
        listFlags(),
        listOrganizations(),
    ]);
    if (!flags || !organizations) {
        return <NotAuthorized email={session.user.email} />;
    }

    return (
        <AdminShell email={staff.email} viaBootstrap={staff.viaBootstrap}>
            <main className="mx-auto max-w-4xl p-6 sm:p-8">
                <h1 className="text-2xl font-semibold">Feature flags</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Precedence: an organization override wins over the global
                    default, which wins over off. Every change records who made
                    it and why.
                </p>

                <div className="mt-6 grid gap-4">
                    {flags.map((flag) => (
                        <FlagCard
                            key={flag.key}
                            flag={flag}
                            organizations={organizations}
                        />
                    ))}
                </div>
            </main>
        </AdminShell>
    );
}
