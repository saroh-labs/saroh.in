// The GST rates a business still has to choose, and the save that chooses
// them. The database is mocked; the rows it would return are in
// `gst-rates.db.spec.ts`.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        service: {
            findMany: jest.fn(),
            updateMany: jest.fn(),
            count: jest.fn(),
        },
        product: {
            findMany: jest.fn(),
            updateMany: jest.fn(),
            count: jest.fn(),
        },
    };
    return {
        ...actual,
        prisma: {
            ...client,
            $transaction: jest.fn((cb: (tx: typeof client) => unknown) =>
                cb(client),
            ),
        },
    };
});
jest.mock("./order-invoicing", () => ({
    loadTaxProfile: jest.fn(),
}));

import "reflect-metadata";

import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { OrgAction } from "../organizations/organization-actions";
import { SetGstRatesDto } from "./gst-rates.dto";
import { GstRatesService } from "./gst-rates.service";
import { loadTaxProfile } from "./order-invoicing";

const profile = loadTaxProfile as jest.Mock;
const services = prisma.service as unknown as Record<string, jest.Mock>;
const products = prisma.product as unknown as Record<string, jest.Mock>;

const owner: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};

/** A role the business made, with exactly these permissions. */
function roleWith(...actions: OrgAction[]): OrganizationContext {
    return {
        ...owner,
        role: "MEMBER",
        roleKey: "desk",
        actions: new Set(actions),
    };
}

const decimal = (s: string) => ({ toString: () => s });
const rates = new GstRatesService();

beforeEach(() => {
    jest.clearAllMocks();
    profile.mockResolvedValue({ registered: true });
    services.findMany!.mockResolvedValue([]);
    products.findMany!.mockResolvedValue([]);
    services.updateMany!.mockResolvedValue({ count: 1 });
    products.updateMany!.mockResolvedValue({ count: 1 });
});

describe("what is missing", () => {
    it("lists nothing, and reads nothing, for a business that isn't registered", async () => {
        profile.mockResolvedValue({ registered: false });
        await expect(rates.missing(owner)).resolves.toEqual({
            registered: false,
            items: [],
            more: false,
        });
        expect(services.findMany).not.toHaveBeenCalled();
        expect(products.findMany).not.toHaveBeenCalled();
    });

    it("lists priced things on sale with no rate, services first", async () => {
        services.findMany!.mockResolvedValue([
            {
                id: "svc_pt",
                name: "Personal Training",
                priceCents: 150_000,
                currency: "INR",
            },
        ]);
        products.findMany!.mockResolvedValue([
            {
                id: "prod_serum",
                name: "Vitamin C serum",
                price: decimal("549.50"),
                currency: "INR",
            },
        ]);
        await expect(rates.missing(owner)).resolves.toEqual({
            registered: true,
            more: false,
            items: [
                {
                    kind: "SERVICE",
                    id: "svc_pt",
                    name: "Personal Training",
                    priceCents: 150_000,
                    currency: "INR",
                    canSet: true,
                },
                {
                    kind: "PRODUCT",
                    id: "prod_serum",
                    name: "Vitamin C serum",
                    priceCents: 54_950,
                    currency: "INR",
                    canSet: true,
                },
            ],
        });
        // Only what can land on a tax invoice untaxed: the business's own,
        // on sale, priced, and with no rate. 0% is a rate and is left out.
        expect(services.findMany!.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            deletedAt: null,
            status: "ACTIVE",
            priceCents: { gt: 0 },
            gstRate: null,
        });
        expect(products.findMany!.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            status: "PUBLISHED",
            price: { gt: 0 },
            gstRate: null,
        });
    });

    it("reads each kind with its own permission", async () => {
        await rates.missing(roleWith("service:read"));
        expect(services.findMany).toHaveBeenCalled();
        expect(products.findMany).not.toHaveBeenCalled();
    });

    it("says who may save: the item's editor, or whoever issues invoices", async () => {
        services.findMany!.mockResolvedValue([
            { id: "svc_pt", name: "PT", priceCents: 100, currency: "INR" },
        ]);
        const read = async (ctx: OrganizationContext) =>
            (await rates.missing(ctx)).items[0]?.canSet;
        await expect(read(roleWith("service:read"))).resolves.toBe(false);
        await expect(
            read(roleWith("service:read", "invoice:write")),
        ).resolves.toBe(true);
        await expect(
            read(roleWith("service:read", "service:write")),
        ).resolves.toBe(true);
    });
});

describe("saving rates", () => {
    const one = (kind: "SERVICE" | "PRODUCT", rate = "18") =>
        ({ items: [{ kind, id: "x_1", rate }] }) as SetGstRatesDto;

    it("saves each rate on the business's own item, exempt included", async () => {
        await expect(
            rates.set(owner, {
                items: [
                    { kind: "SERVICE", id: "svc_pt", rate: "18" },
                    { kind: "PRODUCT", id: "prod_bread", rate: "0" },
                ],
            }),
        ).resolves.toEqual({ saved: 2 });
        expect(services.updateMany).toHaveBeenCalledWith({
            where: { id: "svc_pt", organizationId: "org_1", deletedAt: null },
            data: { gstRate: "18" },
        });
        expect(products.updateMany).toHaveBeenCalledWith({
            where: { id: "prod_bread", organizationId: "org_1" },
            data: { gstRate: "0" },
        });
    });

    it("refuses a rate GST does not have, before anything is written", async () => {
        const attempt = rates.set(owner, one("SERVICE", "7"));
        await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
        await expect(attempt).rejects.toMatchObject({
            response: { details: { field: "rate" } },
        });
        expect(services.updateMany).not.toHaveBeenCalled();
    });

    it("answers another business's item with a 404", async () => {
        services.updateMany!.mockResolvedValue({ count: 0 });
        services.count!.mockResolvedValue(0);
        await expect(rates.set(owner, one("SERVICE"))).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("refuses a role with neither the editor's permission nor invoices", async () => {
        await expect(
            rates.set(
                roleWith("service:read", "booking:write"),
                one("SERVICE"),
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(services.updateMany).not.toHaveBeenCalled();
    });

    it("lets whoever issues invoices fill in a rate nobody chose, and never change one", async () => {
        const desk = roleWith("booking:write", "invoice:write");
        await rates.set(desk, one("SERVICE"));
        // Only where it is still unset.
        expect(services.updateMany).toHaveBeenCalledWith({
            where: {
                id: "x_1",
                organizationId: "org_1",
                deletedAt: null,
                gstRate: null,
            },
            data: { gstRate: "18" },
        });

        // It has a rate already: that is its editor's to change.
        services.updateMany!.mockResolvedValue({ count: 0 });
        services.count!.mockResolvedValue(1);
        await expect(rates.set(desk, one("SERVICE"))).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });
});

describe("what the API accepts", () => {
    const problems = async (body: unknown) =>
        validate(plainToInstance(SetGstRatesDto, body), {
            whitelist: true,
            forbidNonWhitelisted: true,
        });

    it("takes a service's or a product's rate", async () => {
        await expect(
            problems({ items: [{ kind: "SERVICE", id: "s_1", rate: "0" }] }),
        ).resolves.toHaveLength(0);
    });

    it("refuses nothing to save, an unknown kind and a missing rate", async () => {
        await expect(problems({ items: [] })).resolves.not.toHaveLength(0);
        await expect(
            problems({ items: [{ kind: "COURSE", id: "c_1", rate: "18" }] }),
        ).resolves.not.toHaveLength(0);
        await expect(
            problems({ items: [{ kind: "SERVICE", id: "s_1", rate: "" }] }),
        ).resolves.not.toHaveLength(0);
    });
});
