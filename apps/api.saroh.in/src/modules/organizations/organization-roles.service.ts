import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrgRole } from "../../common/types/organization-context";
import { ORG_ROLES } from "../../common/types/organization-context";
import { grantableCapabilities } from "./capability-catalogue";
import type { OrgAction } from "./organization-actions";
import { builtInActions, isBuiltInRole } from "./organization-policy";

/** A role as the Team screen renders it, built-in or invented. */
export interface RoleView {
    key: string;
    label: string;
    actions: OrgAction[];
    ringTone: string;
    /** Built-in: cannot be renamed, re-permissioned or removed. */
    system: boolean;
    /** How many people hold it right now. */
    members: number;
}

/** What a built-in is called, before a business ever stores a row for it. */
const BUILT_IN_LABEL: Record<OrgRole, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Member",
    REVIEWER: "Reviewer",
};

/** The ring each built-in wears, so two people are never visually identical. */
const BUILT_IN_RING: Record<OrgRole, string> = {
    OWNER: "ink",
    ADMIN: "clay",
    MEMBER: "saffron",
    REVIEWER: "slate",
};

const KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The ring every invented role wears — neutral, and not choosable yet.
 *
 * The avatar has exactly four ring colours, one token per built-in
 * (`--role-owner`, `-admin`, `-member`, `-reviewer`). Offering those to an
 * invented role would make it look like a built-in; offering names with no
 * token behind them would draw no ring at all. Neutral is distinct from all
 * four, and the design's own rule covers the rest: "a ring only reinforces —
 * the role name is always beside it in words". Letting a business choose
 * waits on the token layer growing role colours.
 */
const INVENTED_RING = "neutral";

/**
 * The roles a business has, and the ones it invents.
 *
 * The four built-ins are always present whether or not a row exists for them:
 * listing them from code means a business that has never opened this screen
 * still sees the roles its people actually hold, and means adding a built-in
 * later needs no backfill. They are returned as `system` and every write path
 * refuses them — letting a business re-permission OWNER would make role names
 * mean different things in different businesses, and the Owner's guarantee is
 * the one thing no screen may take away.
 */
@Injectable()
export class OrganizationRolesService {
    async list(organizationId: string): Promise<RoleView[]> {
        const [stored, counts] = await Promise.all([
            prisma.organizationRole.findMany({
                where: { organizationId },
                orderBy: { label: "asc" },
            }),
            prisma.membership.groupBy({
                by: ["role"],
                where: { organizationId },
                _count: { role: true },
            }),
        ]);

        const held = new Map(counts.map((c) => [c.role, c._count.role]));
        const byKey = new Map(stored.map((r) => [r.key, r]));

        const builtIns: RoleView[] = ORG_ROLES.map((key) => {
            const row = byKey.get(key);
            return {
                key,
                label: row?.label ?? BUILT_IN_LABEL[key],
                // From code, never from the row: a stored built-in is a
                // rename at most, and its permissions are the shipped policy.
                actions: [...builtInActions(key)],
                ringTone: row?.ringTone ?? BUILT_IN_RING[key],
                system: true,
                members: held.get(key) ?? 0,
            };
        });

        const invented: RoleView[] = stored
            .filter((r) => !isBuiltInRole(r.key))
            .map((r) => ({
                key: r.key,
                label: r.label,
                actions: r.actions as OrgAction[],
                ringTone: r.ringTone,
                system: false,
                members: held.get(r.key) ?? 0,
            }));

        return [...builtIns, ...invented];
    }

    async create(
        organizationId: string,
        input: { label: string; actions: string[] },
    ): Promise<RoleView> {
        const label = input.label.trim();
        if (label.length === 0) {
            throw new BadRequestException("A role needs a name");
        }

        const key = this.toKey(label);
        if (key.length === 0) {
            throw new BadRequestException(
                "Use at least one letter or number in the name",
            );
        }
        // Case-insensitive on purpose. Keys are slugged lowercase and the
        // built-ins are stored uppercase, so a plain comparison let a business
        // invent "Owner" — a second role, looking exactly like the real one on
        // Team, holding whatever it was granted. Nobody reading the roster
        // could tell which Owner could close the business.
        if (isBuiltInRole(key.toUpperCase())) {
            throw new BadRequestException(
                `"${label}" is one of the roles every business has`,
            );
        }

        const clash = await prisma.organizationRole.findUnique({
            where: { organizationId_key: { organizationId, key } },
            select: { id: true },
        });
        if (clash) {
            throw new BadRequestException(
                `This business already has a role called "${label}"`,
            );
        }

        const created = await prisma.organizationRole.create({
            data: {
                organizationId,
                key,
                label,
                actions: this.vetActions(input.actions),
                ringTone: INVENTED_RING,
            },
        });

        return {
            key: created.key,
            label: created.label,
            actions: created.actions as OrgAction[],
            ringTone: created.ringTone,
            system: false,
            members: 0,
        };
    }

    async update(
        organizationId: string,
        key: string,
        input: { label?: string; actions?: string[] },
    ): Promise<RoleView> {
        const role = await this.requireInvented(organizationId, key);

        const updated = await prisma.organizationRole.update({
            where: { id: role.id },
            data: {
                ...(input.label !== undefined
                    ? { label: input.label.trim() }
                    : {}),
                ...(input.actions !== undefined
                    ? { actions: this.vetActions(input.actions) }
                    : {}),
            },
        });

        const members = await prisma.membership.count({
            where: { organizationId, role: key },
        });

        return {
            key: updated.key,
            label: updated.label,
            actions: updated.actions as OrgAction[],
            ringTone: updated.ringTone,
            system: false,
            members,
        };
    }

    /**
     * Remove an invented role.
     *
     * Refused while anyone still holds it. The membership would survive — the
     * key is deliberately not a foreign key, and a dangling one resolves to
     * the read-only floor — but "your permissions silently shrank" is not
     * something to do to someone behind their back. Move them first.
     */
    async remove(organizationId: string, key: string): Promise<void> {
        const role = await this.requireInvented(organizationId, key);

        const members = await prisma.membership.count({
            where: { organizationId, role: key },
        });
        if (members > 0) {
            throw new BadRequestException(
                members === 1
                    ? "One person still holds this role. Move them to another role first."
                    : `${members} people still hold this role. Move them to another role first.`,
            );
        }

        await prisma.organizationRole.delete({ where: { id: role.id } });
    }

    /** The invented role, or the reason it cannot be written to. */
    private async requireInvented(organizationId: string, key: string) {
        if (isBuiltInRole(key)) {
            throw new ForbiddenException(
                `"${key}" is one of the roles every business has, and cannot be changed`,
            );
        }
        const role = await prisma.organizationRole.findUnique({
            where: { organizationId_key: { organizationId, key } },
        });
        if (!role) {
            throw new NotFoundException("Role not found");
        }
        return role;
    }

    /**
     * Keep only permissions that exist AND may be granted.
     *
     * Dropped rather than rejected: an unknown action is a client sending
     * something stale, and refusing the whole save would lose the rest of the
     * owner's work over a string they never typed. What must never happen is
     * storing it — a role cannot hold a power the server does not enforce.
     */
    private vetActions(actions: readonly string[]): OrgAction[] {
        const grantable = new Set<string>(
            grantableCapabilities().map((c) => c.action),
        );
        return [...new Set(actions)].filter((a): a is OrgAction =>
            grantable.has(a),
        );
    }

    /** "Stock clerk" → "stock-clerk". Stable, and readable in a URL. */
    private toKey(label: string): string {
        const key = label
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
        return KEY_PATTERN.test(key) ? key : "";
    }
}
