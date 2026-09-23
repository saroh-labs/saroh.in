import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";

import { AdminShell } from "@/components/admin-shell";
import { FlagCard } from "@/components/flag-card";
import { FlagInspector } from "@/components/flag-inspector";
import { NotAuthorized } from "@/components/not-authorized";
import {
    explainFlag,
    getStaffIdentity,
    listFlags,
    listOrganizations,
} from "@/lib/control-plane";
import { todayIso } from "@/lib/format";
import { requireSession } from "@/lib/session";

/**
 * Feature flags — the rollout control surface (S1-012, DEC feature-flags).
 *
 * This is the piece the module rollout runbook assumed existed: its shadow →
 * internal-org → beta → default-on sequence is entirely "set this flag for this
 * Organization", which until now meant hand-written SQL against a live
 * database. Precedence is override > global default > off, so an override is
 * the targeted-rollout lever and clearing it returns the org to the default.
 */
export const metadata = { title: "Releases" };

export default async function FlagsPage({
    searchParams,
}: {
    searchParams: Promise<{ flag?: string; organizationId?: string }>;
}) {
    const session = await requireSession();

    const staff = await getStaffIdentity();
    if (!staff) return <NotAuthorized email={session.user.email} />;
    if (!staff.permissions.includes("flags:read")) {
        return <NotAuthorized email={session.user.email} />;
    }

    const selected = await searchParams;
    const [flags, organizations, explanation] = await Promise.all([
        listFlags(),
        listOrganizations(),
        selected.flag && selected.organizationId
            ? explainFlag(selected.flag, selected.organizationId).catch(
                  () => null,
              )
            : null,
    ]);
    const today = todayIso();
    if (!flags || !organizations) {
        return <NotAuthorized email={session.user.email} />;
    }

    return (
        <AdminShell staff={staff}>
            <PageContainer>
                <PageHeader
                    breadcrumb={["Instance", "Releases"]}
                    title="Releases"
                    description="A business's own setting wins over the default for everyone, which wins over off. Every change records who made it and why."
                />

                <FlagInspector
                    flags={flags}
                    organizations={organizations}
                    selected={selected}
                    explanation={explanation}
                />

                <div className="grid gap-4">
                    {flags.map((flag) => (
                        <FlagCard
                            key={flag.key}
                            flag={flag}
                            organizations={organizations}
                            canPublish={staff.permissions.includes(
                                "flags:publish",
                            )}
                            today={today}
                        />
                    ))}
                </div>
            </PageContainer>
        </AdminShell>
    );
}
