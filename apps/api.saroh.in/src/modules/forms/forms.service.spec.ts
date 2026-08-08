// DB-free unit tests: @saroh/database is mocked so nothing touches a real
// Postgres. The REAL Prisma namespace is kept (for the InputJsonValue cast);
// only `prisma` is replaced with an in-memory mock.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            form: {
                create: jest.fn(),
                findUnique: jest.fn(),
                findMany: jest.fn(),
                update: jest.fn(),
            },
            site: { findUnique: jest.fn() },
            pipeline: { findUnique: jest.fn() },
        },
    };
});

import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { CreateFormDto, FormFieldDto } from "./dto";
import { FormsService } from "./forms.service";

const formCreate = prisma.form.create as jest.Mock;
const formFindUnique = prisma.form.findUnique as jest.Mock;
const formFindMany = prisma.form.findMany as jest.Mock;
const formUpdate = prisma.form.update as jest.Mock;
const siteFindUnique = prisma.site.findUnique as jest.Mock;
const pipelineFindUnique = prisma.pipeline.findUnique as jest.Mock;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "ADMIN",
        ...over,
    };
}

const emailField: FormFieldDto = {
    name: "email",
    label: "Email",
    type: "email",
    required: true,
};

function dto(over: Partial<CreateFormDto> = {}): CreateFormDto {
    return {
        name: "Contact us",
        fields: [emailField],
        ...over,
    };
}

describe("FormsService.create", () => {
    beforeEach(() => jest.clearAllMocks());

    it("creates an ACTIVE form scoped to the ctx org", async () => {
        const service = new FormsService();
        formCreate.mockImplementation(({ data }: { data: object }) =>
            Promise.resolve({ id: "form_1", ...data }),
        );

        await service.create(ctx(), dto());

        expect(formCreate).toHaveBeenCalledTimes(1);
        const data = formCreate.mock.calls[0][0].data;
        expect(data).toMatchObject({
            organizationId: "org_1",
            name: "Contact us",
            status: "ACTIVE",
            siteId: null,
            pipelineId: null,
        });
        expect(data.fields).toEqual([emailField]);
    });

    it("rejects a MEMBER (form:write is OWNER/ADMIN-only) before any I/O", async () => {
        const service = new FormsService();
        await expect(
            service.create(ctx({ role: "MEMBER" }), dto()),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(formCreate).not.toHaveBeenCalled();
    });

    it("rejects fields with no email field (400) and never creates", async () => {
        const service = new FormsService();
        await expect(
            service.create(
                ctx(),
                dto({
                    fields: [{ name: "name", label: "Name", type: "text" }],
                }),
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(formCreate).not.toHaveBeenCalled();
    });

    it("rejects duplicate field names (400) and never creates", async () => {
        const service = new FormsService();
        await expect(
            service.create(
                ctx(),
                dto({
                    fields: [
                        emailField,
                        { name: "email", label: "Email 2", type: "text" },
                    ],
                }),
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(formCreate).not.toHaveBeenCalled();
    });

    it("404s a cross-tenant siteId and never creates", async () => {
        const service = new FormsService();
        siteFindUnique.mockResolvedValue({
            id: "site_1",
            organizationId: "org_OTHER",
        });
        await expect(
            service.create(ctx(), dto({ siteId: "site_1" })),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(formCreate).not.toHaveBeenCalled();
    });

    it("404s a cross-tenant pipelineId and never creates", async () => {
        const service = new FormsService();
        pipelineFindUnique.mockResolvedValue({
            id: "pipe_1",
            organizationId: "org_OTHER",
        });
        await expect(
            service.create(ctx(), dto({ pipelineId: "pipe_1" })),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(formCreate).not.toHaveBeenCalled();
    });
});

describe("FormsService.list", () => {
    beforeEach(() => jest.clearAllMocks());

    it("scopes to the ctx org, excludes soft-deleted, newest first", async () => {
        const service = new FormsService();
        formFindMany.mockResolvedValue([]);
        await service.list(ctx());
        expect(formFindMany).toHaveBeenCalledWith({
            where: { organizationId: "org_1", deletedAt: null },
            orderBy: { createdAt: "desc" },
        });
    });

    it("denies a MEMBER read? No — form:read is OWNER/ADMIN-only, MEMBER denied", async () => {
        const service = new FormsService();
        await expect(
            service.list(ctx({ role: "MEMBER" })),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(formFindMany).not.toHaveBeenCalled();
    });
});

describe("FormsService.get", () => {
    beforeEach(() => jest.clearAllMocks());

    it("returns an owned form", async () => {
        const service = new FormsService();
        formFindUnique.mockResolvedValue({
            id: "form_1",
            organizationId: "org_1",
            deletedAt: null,
        });
        const res = await service.get(ctx(), "form_1");
        expect(res).toMatchObject({ id: "form_1" });
    });

    it("404s a cross-tenant form", async () => {
        const service = new FormsService();
        formFindUnique.mockResolvedValue({
            id: "form_1",
            organizationId: "org_OTHER",
            deletedAt: null,
        });
        await expect(service.get(ctx(), "form_1")).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("404s a soft-deleted form", async () => {
        const service = new FormsService();
        formFindUnique.mockResolvedValue({
            id: "form_1",
            organizationId: "org_1",
            deletedAt: new Date(),
        });
        await expect(service.get(ctx(), "form_1")).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});

describe("FormsService.update", () => {
    beforeEach(() => jest.clearAllMocks());

    it("updates name/status of an owned form", async () => {
        const service = new FormsService();
        formFindUnique.mockResolvedValue({
            id: "form_1",
            organizationId: "org_1",
            deletedAt: null,
        });
        formUpdate.mockResolvedValue({ id: "form_1" });

        await service.update(ctx(), "form_1", {
            name: "Renamed",
            status: "ARCHIVED",
        });

        expect(formUpdate).toHaveBeenCalledWith({
            where: { id: "form_1" },
            data: { name: "Renamed", status: "ARCHIVED" },
        });
    });

    it("re-validates replaced fields (400 on no email)", async () => {
        const service = new FormsService();
        formFindUnique.mockResolvedValue({
            id: "form_1",
            organizationId: "org_1",
            deletedAt: null,
        });
        await expect(
            service.update(ctx(), "form_1", {
                fields: [{ name: "name", label: "Name", type: "text" }],
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(formUpdate).not.toHaveBeenCalled();
    });

    it("denies a MEMBER write", async () => {
        const service = new FormsService();
        await expect(
            service.update(ctx({ role: "MEMBER" }), "form_1", {
                name: "x",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(formFindUnique).not.toHaveBeenCalled();
    });
});

describe("FormsService.remove", () => {
    beforeEach(() => jest.clearAllMocks());

    it("soft-deletes: sets deletedAt + ARCHIVED", async () => {
        const service = new FormsService();
        formFindUnique.mockResolvedValue({
            id: "form_1",
            organizationId: "org_1",
            deletedAt: null,
        });
        formUpdate.mockResolvedValue({ id: "form_1" });

        const res = await service.remove(ctx(), "form_1");

        expect(formUpdate).toHaveBeenCalledWith({
            where: { id: "form_1" },
            data: { deletedAt: expect.any(Date), status: "ARCHIVED" },
        });
        expect(res).toEqual({ id: "form_1", deleted: true });
    });

    it("404s a cross-tenant remove and updates nothing", async () => {
        const service = new FormsService();
        formFindUnique.mockResolvedValue({
            id: "form_1",
            organizationId: "org_OTHER",
            deletedAt: null,
        });
        await expect(service.remove(ctx(), "form_1")).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(formUpdate).not.toHaveBeenCalled();
    });
});
