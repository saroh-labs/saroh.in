/**
 * Own posts follow the Social permissions (owner, 12 Nov 2026), never the
 * role's name and never website editing: `social:read` to see them,
 * `social:post` to make, change and remove them. Owner and Admin hold both
 * by default; a Member holds neither until given one.
 */
jest.mock("@saroh/database", () => ({
    prisma: {
        sharePost: {
            findMany: jest.fn(() => Promise.resolve([])),
            findFirst: jest.fn(() => Promise.resolve(row)),
            create: jest.fn(() => Promise.resolve(row)),
            updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
            deleteMany: jest.fn(() => Promise.resolve({ count: 1 })),
        },
    },
}));

import { ForbiddenException } from "@nestjs/common";

import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import type { MediaService } from "../media/media.service";
import { can, resolveCapabilities } from "../organizations/organization-policy";
import { SharePostsService } from "./share-posts.service";

const row = {
    id: "post_1",
    headline: "Open late",
    mediaId: null,
    style: "colour",
    size: "post",
    caption: "",
    linkPath: "/",
    createdAt: new Date(0),
    updatedAt: new Date(0),
};

const posts = new SharePostsService({} as MediaService);

function person(role: OrgRole, extras: string[] = []): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role,
        roleKey: role,
        actions: resolveCapabilities(role, null, extras),
    } as OrganizationContext;
}

const reads = (ctx: OrganizationContext) => [
    () => posts.list(ctx),
    () => posts.get(ctx, "post_1"),
];
const writes = (ctx: OrganizationContext) => [
    () => posts.create(ctx, { headline: "Open late" }),
    () => posts.update(ctx, "post_1", { headline: "Open later" }),
    () => posts.remove(ctx, "post_1"),
];

describe("own posts follow the Social permissions", () => {
    it("gives Owner and Admin both by default, a Member and a Reviewer neither", () => {
        for (const role of ["OWNER", "ADMIN"] as const) {
            expect(can(role, "social:read")).toBe(true);
            expect(can(role, "social:post")).toBe(true);
        }
        for (const role of ["MEMBER", "REVIEWER"] as const) {
            expect(can(role, "social:read")).toBe(false);
            expect(can(role, "social:post")).toBe(false);
        }
    });

    it("lets an Owner and an Admin read and write", async () => {
        for (const role of ["OWNER", "ADMIN"] as const) {
            for (const work of [
                ...reads(person(role)),
                ...writes(person(role)),
            ]) {
                await expect(work()).resolves.not.toThrow();
            }
        }
    });

    it("refuses a Member every read and write", async () => {
        const member = person("MEMBER");
        for (const work of [...reads(member), ...writes(member)]) {
            await expect(work()).rejects.toBeInstanceOf(ForbiddenException);
        }
    });

    it("lets a Member given social:read see posts but not make them", async () => {
        const member = person("MEMBER", ["social:read"]);
        for (const work of reads(member)) {
            await expect(work()).resolves.not.toThrow();
        }
        for (const work of writes(member)) {
            await expect(work()).rejects.toMatchObject({
                response: { details: { action: "social:post" } },
            });
        }
    });

    it("lets a Member given social:post make, change, remove and see posts", async () => {
        const member = person("MEMBER", ["social:post"]);
        expect(member.actions?.has("social:read")).toBe(true);
        for (const work of [...reads(member), ...writes(member)]) {
            await expect(work()).resolves.not.toThrow();
        }
    });

    it("never asks website editing: an Admin-made role with section:write only is refused", async () => {
        const editor = {
            ...person("MEMBER"),
            roleKey: "editor",
            actions: resolveCapabilities("editor", [
                "section:write",
                "site:read",
            ]),
        } as OrganizationContext;
        for (const work of [...reads(editor), ...writes(editor)]) {
            await expect(work()).rejects.toBeInstanceOf(ForbiddenException);
        }
    });
});
