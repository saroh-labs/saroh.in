import { FailedPanel } from "@/components/states/failed-panel";
import { RolesMatrixView } from "@/components/team/roles-matrix";
import { requireStaff } from "@/lib/console";
import type { AdminRole } from "@/lib/control-plane";
import { buildRolesMatrix } from "@/lib/roles-matrix";
import { listTeam, listTeamRoles } from "@/lib/staff";

export const metadata = { title: "Console roles" };

/**
 * Console roles (R31): what each role may do, in plain words, from the
 * API's registry, and how many people hold each.
 */
export default async function ConsoleRolesPage() {
    const gate = await requireStaff("team:read");
    if (!gate.ok) return null;

    const [roles, members] = await Promise.all([
        listTeamRoles().catch(() => null),
        listTeam().catch(() => null),
    ]);
    if (!roles) return <FailedPanel things="the roles" />;

    const holders: Partial<Record<AdminRole, number>> = {};
    if (members) {
        for (const definition of roles) holders[definition.role] = 0;
        for (const member of members) {
            if (member.revokedAt) continue;
            for (const role of new Set(member.roles.map((r) => r.role))) {
                holders[role] = (holders[role] ?? 0) + 1;
            }
        }
    }

    return (
        <RolesMatrixView matrix={buildRolesMatrix(roles)} holders={holders} />
    );
}
