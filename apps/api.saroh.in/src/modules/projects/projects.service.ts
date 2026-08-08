import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import { slugify } from "../stores/slug";
import type { CreateProjectDto } from "./dto";
import { ProjectAccessService } from "./project-access.service";

/**
 * Minimal Project lifecycle (S1-010). Projects are an OPTIONAL org-scoped
 * grouping — never a tenant root (ADR-001). Structural changes (create) require
 * OWNER/ADMIN (`org:update`); reads defer to {@link ProjectAccessService} so the
 * OWNER/ADMIN-see-all vs MEMBER-granted rule is enforced in exactly one place.
 */
@Injectable()
export class ProjectsService {
    constructor(private readonly access: ProjectAccessService) {}

    /** Projects the caller can access (OWNER/ADMIN → all; MEMBER → granted). */
    list(ctx: OrganizationContext) {
        return this.access.listAccessibleProjects(ctx);
    }

    /** Create a project in the caller's org. OWNER/ADMIN only. */
    async create(
        ctx: OrganizationContext,
        dto: CreateProjectDto,
    ): Promise<{ id: string }> {
        authorize(ctx, "org:update");
        const slug = slugify(dto.slug ?? dto.name);
        if (!slug) {
            throw new BadRequestException({
                message: "Could not derive a slug from the name",
                field: "slug",
            });
        }
        try {
            const project = await prisma.project.create({
                data: {
                    organizationId: ctx.organizationId,
                    name: dto.name,
                    slug,
                },
            });
            return { id: project.id };
        } catch {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
    }

    /**
     * One project the caller can reach, with their effective project role. A
     * MEMBER without any grant gets a 404 (no existence leak), matching the
     * store read semantics.
     */
    async get(ctx: OrganizationContext, projectId: string) {
        const project = await prisma.project.findFirst({
            where: { id: projectId, organizationId: ctx.organizationId },
            select: { id: true, name: true, slug: true, createdAt: true },
        });
        if (!project) {
            throw new NotFoundException("Project not found");
        }
        const role = await this.access.resolveProjectRole(
            ctx.userId,
            projectId,
            ctx.role,
        );
        if (role === null) {
            throw new NotFoundException("Project not found");
        }
        return { ...project, role };
    }
}
