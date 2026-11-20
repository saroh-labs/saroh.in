import "reflect-metadata";

// The controller's guards and services: only its route metadata is read.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class {},
}));
jest.mock("../capabilities/module-enforcement.guard", () => ({
    ModuleEnforcementGuard: class {},
}));
jest.mock("./posts.service", () => ({ PostsService: class {} }));
jest.mock("./post-revisions.service", () => ({
    PostRevisionsService: class {},
}));
jest.mock("./post-approval.service", () => ({
    PostApprovalService: class {},
}));

import { NotFoundException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";

import { env } from "../../env";
import { planMeter } from "../billing/metering.service";
import { unitApprovals } from "../sites/change-approvals";
import { WebsiteAreaSwitchGuard } from "../sites/website-area-switch";
import {
    isLeadRole,
    postApprovalOn,
    postApprovalUnit,
    postFingerprint,
    postHeldForApproval,
    postUnitKey,
} from "./post-approval";
import type { RevisionState } from "./post-revisions";
import { PostsController } from "./posts.controller";

const state: RevisionState = {
    title: "Bridal trial",
    content: "<p>What a trial covers.</p>",
    excerpt: null,
    image: null,
    imageAlt: null,
    seoTitle: null,
    seoDescription: null,
    shareImageUrl: null,
    slug: "bridal-trial",
    categoryId: null,
    authorId: "writer",
};

function revisions(last: { savedByUserId: string | null } | null) {
    return { postRevision: { findFirst: jest.fn().mockResolvedValue(last) } };
}

describe("a post as one change unit (O7)", () => {
    it("binds to what goes live: any edit changes the fingerprint", () => {
        expect(postFingerprint(state)).toBe(postFingerprint({ ...state }));
        expect(
            postFingerprint({ ...state, content: "<p>Edited</p>" }),
        ).not.toBe(postFingerprint(state));
        expect(postFingerprint({ ...state, slug: "trial" })).not.toBe(
            postFingerprint(state),
        );
    });

    it("names the newest edit's saver as the last editor, else the writer", async () => {
        const by = await postApprovalUnit(
            revisions({ savedByUserId: "arjun" }) as never,
            "p1",
            state,
        );
        expect(by).toEqual({
            key: postUnitKey("p1"),
            fingerprint: postFingerprint(state),
            editedBy: "arjun",
        });
        const none = await postApprovalUnit(
            revisions(null) as never,
            "p1",
            state,
        );
        expect(none.editedBy).toBe("writer");
    });

    it("an approval is void once the post is edited after it", () => {
        const unit = {
            key: "post:p1",
            fingerprint: postFingerprint(state),
            editedBy: "writer",
        };
        const row = {
            unitKey: "post:p1",
            unitFingerprint: unit.fingerprint,
            byUserId: "kavya",
            outcome: "APPROVED",
            reason: null,
            createdAt: new Date(),
        };
        expect(
            unitApprovals([unit], [row], new Set()).get("post:p1")?.state,
        ).toBe("approved");
        const edited = {
            ...unit,
            fingerprint: postFingerprint({ ...state, title: "New title" }),
        };
        const after = unitApprovals([edited], [row], new Set()).get("post:p1");
        expect(after?.state).toBe("waiting");
        expect(after?.voided).toBe(true);
    });

    it("an owner's or admin's post needs no approval (DEC-103)", () => {
        const unit = { key: "post:p1", fingerprint: "f", editedBy: "asha" };
        expect(
            unitApprovals([unit], [], new Set(["asha"])).get("post:p1")?.state,
        ).toBe("not-needed");
        expect(isLeadRole({ role: "OWNER" })).toBe(true);
        expect(isLeadRole({ role: "ADMIN" })).toBe(true);
        expect(isLeadRole({ role: "MEMBER" })).toBe(false);
    });

    it("holds nothing for a lead, or with the setting off", async () => {
        const input = {
            organizationId: "o",
            siteId: "s",
            postId: "p1",
            userId: "u",
        };
        const tx = {
            site: {
                findFirst: jest
                    .fn()
                    .mockResolvedValue({ publishNeedsApproval: false }),
            },
        };
        expect(
            await postHeldForApproval(tx as never, { ...input, lead: true }),
        ).toBe(false);
        expect(tx.site.findFirst).not.toHaveBeenCalled();
        expect(
            await postHeldForApproval(tx as never, { ...input, lead: false }),
        ).toBe(false);
    });
});

describe("only with the Website area on (owner, 20 Nov 2026)", () => {
    const original = { area: env.WEBSITE_AREA, node: env.NODE_ENV };
    afterEach(() => {
        env.WEBSITE_AREA = original.area;
        env.NODE_ENV = original.node;
        jest.restoreAllMocks();
    });
    const site = () => ({
        site: {
            findFirst: jest
                .fn()
                .mockResolvedValue({ publishNeedsApproval: true }),
        },
    });

    it("applies nothing while the area is off, unset outside development included", async () => {
        for (const [area, node] of [
            ["off", "development"],
            [undefined, "production"],
            [undefined, "test"],
        ] as const) {
            env.WEBSITE_AREA = area;
            env.NODE_ENV = node;
            const tx = site();
            expect(await postApprovalOn(tx as never, "o", "s")).toBe(false);
            expect(tx.site.findFirst).not.toHaveBeenCalled();
            expect(() => new WebsiteAreaSwitchGuard().canActivate()).toThrow(
                NotFoundException,
            );
        }
    });

    it("reads the site's setting while the area is on, unset under development included", async () => {
        jest.spyOn(planMeter, "isIncluded").mockResolvedValue(true);
        for (const [area, node] of [
            ["on", "production"],
            [undefined, "development"],
        ] as const) {
            env.WEBSITE_AREA = area;
            env.NODE_ENV = node;
            expect(await postApprovalOn(site() as never, "o", "s")).toBe(true);
            expect(new WebsiteAreaSwitchGuard().canActivate()).toBe(true);
        }
    });

    it("guards Send for approval, Approve and Ask for changes", () => {
        for (const name of ["requestApproval", "approve", "askForChanges"]) {
            const guards = Reflect.getMetadata(
                GUARDS_METADATA,
                PostsController.prototype[
                    name as keyof typeof PostsController.prototype
                ],
            ) as unknown[];
            expect(guards).toEqual([WebsiteAreaSwitchGuard]);
        }
    });
});
