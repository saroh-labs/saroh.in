import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import type { ProjectRole } from "./project-role";
import { isProjectRole, strongestProjectRole } from "./project-role";

/** A Project as surfaced to the caller, with the caller's resolved project role. */
export interface AccessibleProject {
    id: string;
    name: string;
    slug: string;
    role: ProjectRole;
}

/**
 * Project-level access resolution and management (S1-010).
 *
 * Two read paths (ADR-001):
 *  - OWNER/ADMIN implicitly see EVERY Project in their org and act as MANAGER on
 *    each (no grant required).
 *  - a MEMBER sees only Projects granted to them directly OR via a Team, and
 *    their effective role is the STRONGEST of every granting path
 *    (MANAGER > EDITOR > VIEWER).
 *
 * All mutations (create/delete Projects & Teams, grant/revoke, team membership)
 * are gated on the `project:access:manage` OrgAction — OWNER/ADMIN only — via
 * the central organization policy. A prerequisite for granting access to a user
 * (directly or by adding them to a Team) is that the user is already a Member of
 * the organization; violating it yields a clear 400.
 */
@Injectable()
export class ProjectAccessService {
    // ------------------------------------------------------------------ reads

    /**
     * Projects the caller can access. OWNER/ADMIN → all projects in the org;
     * MEMBER → the de-duplicated union of directly-granted and Team-granted
     * projects, each carrying the caller's strongest effective role.
     */
    async listAccessibleProjects(
        ctx: OrganizationContext,
    ): Promise<AccessibleProject[]> {
        if (ctx.role === "OWNER" || ctx.role === "ADMIN") {
            const projects = await prisma.project.findMany({
                where: { organizationId: ctx.organizationId },
                orderBy: { name: "asc" },
                select: { id: true, name: true, slug: true },
            });
            // OWNER/ADMIN act with full (MANAGER-equivalent) capability.
            return projects.map((project) => ({ ...project, role: "MANAGER" }));
        }

        // MEMBER: fetch every project in the org that has at least one grant
        // reaching this user (direct or via a team they belong to), together
        // with those grants so we can compute the strongest role per project.
        const projects = await prisma.project.findMany({
            where: {
                organizationId: ctx.organizationId,
                access: {
                    some: {
                        OR: [
                            { userId: ctx.userId },
                            {
                                team: {
                                    members: { some: { userId: ctx.userId } },
                                },
                            },
                        ],
                    },
                },
            },
            orderBy: { name: "asc" },
            select: {
                id: true,
                name: true,
                slug: true,
                access: {
                    where: {
                        OR: [
                            { userId: ctx.userId },
                            {
                                team: {
                                    members: { some: { userId: ctx.userId } },
                                },
                            },
                        ],
                    },
                    select: { role: true },
                },
            },
        });

        const result: AccessibleProject[] = [];
        for (const project of projects) {
            const role = strongestProjectRole(
                project.access.map((grant) => grant.role),
            );
            // Guaranteed non-null by the `some` filter, but stay defensive.
            if (role === null) continue;
            result.push({
                id: project.id,
                name: project.name,
                slug: project.slug,
                role,
            });
        }
        return result;
    }

    /**
     * The caller's effective role on one Project, or `null` if they have no
     * access. OWNER/ADMIN → MANAGER (full). Otherwise the strongest of the
     * user's direct grant and any Team grant on that project.
     */
    async resolveProjectRole(
        userId: string,
        projectId: string,
        orgRole: OrgRole,
    ): Promise<ProjectRole | null> {
        if (orgRole === "OWNER" || orgRole === "ADMIN") {
            return "MANAGER";
        }

        const grants = await prisma.projectAccess.findMany({
            where: {
                projectId,
                OR: [{ userId }, { team: { members: { some: { userId } } } }],
            },
            select: { role: true },
        });

        return strongestProjectRole(grants.map((grant) => grant.role));
    }

    // -------------------------------------------------------- access grants

    /** Grant (or update) a direct project role to a user. OWNER/ADMIN only. */
    async grantToUser(
        ctx: OrganizationContext,
        projectId: string,
        userId: string,
        role: ProjectRole,
    ): Promise<{ id: string }> {
        authorize(ctx, "project:access:manage");
        this.assertProjectRole(role);
        await this.requireProject(ctx, projectId);
        await this.requireOrgMember(ctx.organizationId, userId);

        const grant = await prisma.projectAccess.upsert({
            where: { projectId_userId: { projectId, userId } },
            create: { projectId, userId, role },
            update: { role },
        });
        return { id: grant.id };
    }

    /** Grant (or update) a project role to a team. OWNER/ADMIN only. */
    async grantToTeam(
        ctx: OrganizationContext,
        projectId: string,
        teamId: string,
        role: ProjectRole,
    ): Promise<{ id: string }> {
        authorize(ctx, "project:access:manage");
        this.assertProjectRole(role);
        await this.requireProject(ctx, projectId);
        await this.requireTeam(ctx, teamId);

        const grant = await prisma.projectAccess.upsert({
            where: { projectId_teamId: { projectId, teamId } },
            create: { projectId, teamId, role },
            update: { role },
        });
        return { id: grant.id };
    }

    /** Remove a user's direct grant on a project (idempotent). OWNER/ADMIN only. */
    async revokeFromUser(
        ctx: OrganizationContext,
        projectId: string,
        userId: string,
    ): Promise<{ revoked: number }> {
        authorize(ctx, "project:access:manage");
        await this.requireProject(ctx, projectId);
        const { count } = await prisma.projectAccess.deleteMany({
            where: { projectId, userId },
        });
        return { revoked: count };
    }

    /** Remove a team's grant on a project (idempotent). OWNER/ADMIN only. */
    async revokeFromTeam(
        ctx: OrganizationContext,
        projectId: string,
        teamId: string,
    ): Promise<{ revoked: number }> {
        authorize(ctx, "project:access:manage");
        await this.requireProject(ctx, projectId);
        const { count } = await prisma.projectAccess.deleteMany({
            where: { projectId, teamId },
        });
        return { revoked: count };
    }

    /** All grants on a project (direct + team). OWNER/ADMIN only. */
    async listGrants(ctx: OrganizationContext, projectId: string) {
        authorize(ctx, "project:access:manage");
        await this.requireProject(ctx, projectId);
        return prisma.projectAccess.findMany({
            where: { projectId },
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                role: true,
                userId: true,
                teamId: true,
            },
        });
    }

    // --------------------------------------------------------------- teams

    /** Teams in the caller's org. */
    async listTeams(ctx: OrganizationContext) {
        return prisma.team.findMany({
            where: { organizationId: ctx.organizationId },
            orderBy: { name: "asc" },
            select: {
                id: true,
                name: true,
                _count: { select: { members: true } },
            },
        });
    }

    /** Create a team. OWNER/ADMIN only; team names are unique per org. */
    async createTeam(
        ctx: OrganizationContext,
        name: string,
    ): Promise<{ id: string }> {
        authorize(ctx, "project:access:manage");
        try {
            const team = await prisma.team.create({
                data: { organizationId: ctx.organizationId, name },
            });
            return { id: team.id };
        } catch {
            throw new ConflictException({
                message: "A team with that name already exists",
                field: "name",
            });
        }
    }

    /** Delete a team (its memberships + grants cascade). OWNER/ADMIN only. */
    async deleteTeam(
        ctx: OrganizationContext,
        teamId: string,
    ): Promise<{ id: string }> {
        authorize(ctx, "project:access:manage");
        await this.requireTeam(ctx, teamId);
        await prisma.team.delete({ where: { id: teamId } });
        return { id: teamId };
    }

    /** Add an org member to a team. OWNER/ADMIN only; user must be a Member. */
    async addTeamMember(
        ctx: OrganizationContext,
        teamId: string,
        userId: string,
    ): Promise<{ id: string }> {
        authorize(ctx, "project:access:manage");
        await this.requireTeam(ctx, teamId);
        await this.requireOrgMember(ctx.organizationId, userId);
        const member = await prisma.teamMember.upsert({
            where: { teamId_userId: { teamId, userId } },
            create: { teamId, userId },
            update: {},
        });
        return { id: member.id };
    }

    /** Remove a user from a team (idempotent). OWNER/ADMIN only. */
    async removeTeamMember(
        ctx: OrganizationContext,
        teamId: string,
        userId: string,
    ): Promise<{ removed: number }> {
        authorize(ctx, "project:access:manage");
        await this.requireTeam(ctx, teamId);
        const { count } = await prisma.teamMember.deleteMany({
            where: { teamId, userId },
        });
        return { removed: count };
    }

    // ------------------------------------------------------------- helpers

    /** Assert a project exists AND belongs to the caller's org (no leak). */
    private async requireProject(
        ctx: OrganizationContext,
        projectId: string,
    ): Promise<void> {
        const project = await prisma.project.findFirst({
            where: { id: projectId, organizationId: ctx.organizationId },
            select: { id: true },
        });
        if (!project) {
            throw new NotFoundException("Project not found");
        }
    }

    /** Assert a team exists AND belongs to the caller's org (no leak). */
    private async requireTeam(
        ctx: OrganizationContext,
        teamId: string,
    ): Promise<void> {
        const team = await prisma.team.findFirst({
            where: { id: teamId, organizationId: ctx.organizationId },
            select: { id: true },
        });
        if (!team) {
            throw new NotFoundException("Team not found");
        }
    }

    /**
     * Membership prerequisite: you cannot grant project access to — or team a —
     * user who is not a Member of the organization. Yields a clear 400.
     */
    private async requireOrgMember(
        organizationId: string,
        userId: string,
    ): Promise<void> {
        const membership = await prisma.membership.findUnique({
            where: { organizationId_userId: { organizationId, userId } },
            select: { id: true },
        });
        if (!membership) {
            throw new BadRequestException(
                "User must be a member of the organization before being granted project access",
            );
        }
    }

    /** Defensive guard: the DTO already validates, but never trust a raw string. */
    private assertProjectRole(role: string): asserts role is ProjectRole {
        if (!isProjectRole(role)) {
            throw new BadRequestException(`Unknown project role "${role}"`);
        }
    }
}
