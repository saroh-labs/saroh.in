import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import { ORG_ROLES } from "../../common/types/organization-context";
import { planMeter } from "../billing/metering.service";
import {
    CAPABILITY_BY_ACTION,
    grantableCapabilities,
} from "./capability-catalogue";
import type { OrgAction } from "./organization-actions";
import {
    builtInActions,
    isBuiltInRole,
    outOfReach,
    resolveCapabilities,
} from "./organization-policy";

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
    /**
     * Everything the role lets its holders do, implied holds included, for
     * an invented role (a built-in's `actions` are already that). Team's
     * extra permissions show these as coming with the role (F17).
     */
    grants?: OrgAction[];
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
 *
 * Every write is bounded by the writer's reach (F19): a role can be given only
 * what the person saving it holds themselves, and a role that can already do
 * more than they can is not theirs to change or remove. Without it, anyone
 * holding `member:role:update` could tick `payment:manage` onto their own role.
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
                grants: [...resolveCapabilities(r.key, r.actions)],
            }));

        return [...builtIns, ...invented];
    }

    async create(
        ctx: OrganizationContext,
        input: { label: string; actions: string[] },
    ): Promise<RoleView> {
        const { organizationId } = ctx;
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

        const actions = this.vetActions(input.actions);
        this.assertCanGrant(ctx, key, actions);
        // Custom roles are a plan row (U13): refused where the plan leaves
        // it off. Roles made before stay, and keep working.
        await planMeter.assertIncluded(organizationId, "roles");

        const created = await prisma.organizationRole.create({
            data: {
                organizationId,
                key,
                label,
                actions,
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

    /**
     * Rename or re-permission an invented role.
     *
     * Two reach checks, in this order. The role as it stands must already be
     * within the writer's reach — even for a rename, because a role above you
     * is held by people who can do more than you, and editing it would let
     * you strip powers from them. Then everything it would hold after the
     * save must be too. Taking away a permission you hold is always fine.
     * Editing your own role follows the same rule, so it can never add what
     * you lack.
     */
    async update(
        ctx: OrganizationContext,
        key: string,
        input: { label?: string; actions?: string[] },
    ): Promise<RoleView> {
        const { organizationId } = ctx;
        const role = await this.requireInvented(organizationId, key);
        this.assertCanChange(ctx, role, "change");

        const actions =
            input.actions !== undefined
                ? this.vetActions(input.actions)
                : undefined;
        if (actions) this.assertCanGrant(ctx, key, actions);

        // Only if nobody saved it since it was checked: a role widened by
        // someone else in between would otherwise be written over by a
        // person it is now beyond.
        const { count } = await prisma.organizationRole.updateMany({
            where: { id: role.id, updatedAt: role.updatedAt },
            data: {
                ...(input.label !== undefined
                    ? { label: input.label.trim() }
                    : {}),
                ...(actions ? { actions } : {}),
            },
        });
        if (count === 0) throw roleChangedMeanwhile();
        const updated = await prisma.organizationRole.findUnique({
            where: { id: role.id },
        });
        if (!updated) throw roleChangedMeanwhile();

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
     *
     * Refused, too, when the role can do more than the person removing it:
     * the same reach rule as changing it.
     */
    async remove(ctx: OrganizationContext, key: string): Promise<void> {
        const { organizationId } = ctx;
        const role = await this.requireInvented(organizationId, key);
        this.assertCanChange(ctx, role, "remove");

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

        const { count } = await prisma.organizationRole.deleteMany({
            where: { id: role.id, updatedAt: role.updatedAt },
        });
        if (count === 0) throw roleChangedMeanwhile();
    }

    /**
     * Refuse to touch a role that can already do more than the writer.
     *
     * Judged on what the role RESOLVES to, implied holds included — the set
     * a person holding it actually gets.
     */
    private assertCanChange(
        ctx: OrganizationContext,
        role: { key: string; actions: string[] },
        verb: "change" | "remove",
    ): void {
        const beyond = outOfReach(
            ctx,
            resolveCapabilities(role.key, role.actions),
        );
        if (beyond.length > 0) {
            throw new ForbiddenException(
                `You can't ${verb} a role that can do more than you can: ${labelsOf(beyond)}.`,
            );
        }
    }

    /**
     * Refuse to give a role a permission the writer doesn't hold.
     *
     * The role's resolved set is checked, so a permission that brings
     * another with it can't carry the second one past the rule. The message
     * names what was ticked where it can, since that is what the person chose.
     */
    private assertCanGrant(
        ctx: OrganizationContext,
        key: string,
        actions: readonly OrgAction[],
    ): void {
        const beyond = outOfReach(ctx, resolveCapabilities(key, actions));
        if (beyond.length === 0) return;
        const ticked = beyond.filter((a) => actions.includes(a));
        throw new ForbiddenException(
            `You can't give a role a permission you don't have: ${labelsOf(ticked.length > 0 ? ticked : beyond)}.`,
        );
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

/** Permissions as the owner reads them on Team: "Manage payments, See invoices". */
function labelsOf(actions: readonly OrgAction[]): string {
    return actions
        .map((a) => CAPABILITY_BY_ACTION.get(a)?.label ?? a)
        .join(", ");
}

/** The role was saved or removed by someone else between the check and the write. */
function roleChangedMeanwhile(): ConflictException {
    return new ConflictException(
        "Someone changed this role while you were editing it. Reload to see it, then try again.",
    );
}
