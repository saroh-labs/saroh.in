import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { CreateStoreDto, UpdateStoreDto } from "./dto";
import { slugify } from "./slug";

/** Staff roles allowed to mutate a store (VIEWER is read-only). */
const WRITE_ROLES = new Set(["ADMIN", "MANAGER", "EDITOR"]);

/**
 * Store data layer — the single place the DB is touched for stores. Every
 * method takes an explicit `userId` (resolved from the Better Auth session by
 * the controller, never client input). Authorization: a StoreOwner has full
 * access; a StoreMembers staffer can read, and can write only with a
 * write-capable role (ADMIN/MANAGER/EDITOR — not VIEWER).
 */
@Injectable()
export class StoresService {
    /** Stores the user owns or is a member of (newest first), non-deleted. */
    listForUser(userId: string) {
        return prisma.store.findMany({
            where: {
                deletedAt: null,
                OR: [
                    { owners: { some: { userId } } },
                    { members: { some: { userId } } },
                ],
            },
            orderBy: { createdAt: "desc" },
        });
    }

    /** The store if the user can access it; 404 otherwise (no existence leak). */
    async getForUser(storeId: string, userId: string) {
        const store = await prisma.store.findFirst({
            where: {
                id: storeId,
                deletedAt: null,
                OR: [
                    { owners: { some: { userId } } },
                    { members: { some: { userId } } },
                ],
            },
        });
        if (!store) {
            throw new NotFoundException("Store not found");
        }
        return store;
    }

    async isOwner(storeId: string, userId: string): Promise<boolean> {
        const owner = await prisma.storeOwner.findUnique({
            where: { storeId_userId: { storeId, userId } },
        });
        return Boolean(owner);
    }

    /** Owner, or a member with a write-capable role. */
    async canWrite(storeId: string, userId: string): Promise<boolean> {
        if (await this.isOwner(storeId, userId)) return true;
        const member = await prisma.storeMembers.findUnique({
            where: { storeId_userId: { storeId, userId } },
            select: { role: true },
        });
        return Boolean(member && WRITE_ROLES.has(member.role));
    }

    /** Create a store and record the creator as OWNER, atomically. */
    async createForUser(userId: string, dto: CreateStoreDto) {
        const slug = slugify(dto.slug ?? dto.name);
        if (!slug) {
            throw new BadRequestException({
                message: "Could not derive a slug from the name",
                field: "slug",
            });
        }
        if (!(await this.isSlugAvailable(slug))) {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }

        try {
            const store = await prisma.store.create({
                data: {
                    name: dto.name,
                    slug,
                    description: dto.description || null,
                    // Nested create runs in one transaction → no orphan store.
                    owners: { create: { userId, role: "OWNER" } },
                },
            });
            return { id: store.id };
        } catch {
            // Unique-constraint backstop for a slug race between the check
            // above and the insert.
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
    }

    /** Update a store's core fields — owner or a write-capable member. */
    async updateForUser(userId: string, storeId: string, dto: UpdateStoreDto) {
        if (!(await this.canWrite(storeId, userId))) {
            throw new NotFoundException("Store not found");
        }

        const slug = slugify(dto.slug);
        const current = await prisma.store.findUnique({
            where: { id: storeId },
            select: { slug: true },
        });
        if (
            current &&
            current.slug !== slug &&
            !(await this.isSlugAvailable(slug))
        ) {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }

        try {
            await prisma.store.update({
                where: { id: storeId },
                data: {
                    name: dto.name,
                    slug,
                    description: dto.description ?? null,
                    logo: dto.logo || null,
                },
            });
            return { id: storeId };
        } catch {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
    }

    /** Store slugs are globally unique (Store.slug @unique). */
    private async isSlugAvailable(slug: string): Promise<boolean> {
        const existing = await prisma.store.findUnique({ where: { slug } });
        return !existing;
    }
}
