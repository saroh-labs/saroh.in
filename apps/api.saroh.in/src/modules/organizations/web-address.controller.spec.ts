/**
 * The web address routes (DEC-069, plan L2), with no database: the paths
 * and guards, what the body accepts, and the refusals the service makes
 * before it reads anything — an Admin, a Member, and the rollout off.
 * The change itself is `web-address.service.db.spec.ts`.
 */
import "reflect-metadata";

// Importing the guards would pull in better-auth's ESM; the routes only
// need to name them.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../common/guards/organization.guard", () => ({
    OrganizationGuard: class OrganizationGuard {},
}));

const isEnabled = jest.fn();
jest.mock("../feature-flags/feature-flags.service", () => ({
    FeatureFlagService: jest.fn().mockImplementation(() => ({ isEnabled })),
}));

const transaction = jest.fn();
jest.mock("@saroh/database", () => ({
    prisma: { $transaction: transaction },
    currentOrgContext: () => undefined,
    isRlsEnforcementEnabled: () => false,
    outsideOrgContext: (fn: () => unknown) => fn(),
    runInOrgContext: (_id: string, fn: () => unknown) => fn(),
}));

import {
    BadRequestException,
    ForbiddenException,
    RequestMethod,
    ValidationPipe,
} from "@nestjs/common";
import {
    GUARDS_METADATA,
    METHOD_METADATA,
    PATH_METADATA,
} from "@nestjs/common/constants";

import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import { validationPipeOptions } from "../../common/validation";
import { WebAddressController } from "./web-address.controller";
import { ChangeWebAddressDto } from "./web-address.dto";
import {
    CHANGE_UNAVAILABLE_MESSAGE,
    WebAddressService,
} from "./web-address.service";

function ctx(role: OrgRole): OrganizationContext {
    return { organizationId: "org_1", userId: "user_1", role };
}

const handler = (name: keyof WebAddressController) =>
    WebAddressController.prototype[name] as unknown as object;

describe("the web address routes", () => {
    it("live under the business, behind sign-in and membership", () => {
        expect(Reflect.getMetadata(PATH_METADATA, WebAddressController)).toBe(
            "organizations/:organizationId/web-address",
        );
        const guards = (
            Reflect.getMetadata(GUARDS_METADATA, WebAddressController) as {
                name: string;
            }[]
        ).map((g) => g.name);
        expect(guards).toEqual(["BetterAuthGuard", "OrganizationGuard"]);
    });

    it("read, check and change", () => {
        const route = (name: keyof WebAddressController) => [
            Reflect.getMetadata(METHOD_METADATA, handler(name)) as number,
            Reflect.getMetadata(PATH_METADATA, handler(name)) as string,
        ];
        expect(route("read")).toEqual([RequestMethod.GET, "/"]);
        expect(route("availability")).toEqual([
            RequestMethod.GET,
            "availability",
        ]);
        expect(route("change")).toEqual([RequestMethod.PUT, "/"]);
    });

    it("hand the service the business's context and the address", async () => {
        const service = {
            read: jest.fn().mockResolvedValue("view"),
            availability: jest.fn().mockResolvedValue("free"),
            change: jest.fn().mockResolvedValue("moved"),
        };
        const controller = new WebAddressController(
            service as unknown as WebAddressService,
        );
        const owner = ctx("OWNER");

        await expect(controller.read(owner)).resolves.toBe("view");
        await controller.availability(owner, "rye-bakery");
        expect(service.availability).toHaveBeenCalledWith(owner, "rye-bakery");
        // A repeated ?address= is an array: it asks about nothing.
        await controller.availability(owner, ["a", "b"]);
        expect(service.availability).toHaveBeenLastCalledWith(owner, "");
        await controller.change(owner, { address: "rye-bakery" });
        expect(service.change).toHaveBeenCalledWith(owner, "rye-bakery");
    });
});

describe("what a change accepts", () => {
    const pipe = new ValidationPipe(validationPipeOptions);
    const body = (value: unknown) =>
        pipe.transform(value, {
            type: "body",
            metatype: ChangeWebAddressDto,
        }) as Promise<ChangeWebAddressDto>;

    it("trims and lowercases the address", async () => {
        await expect(body({ address: "  Rye-Bakery " })).resolves.toEqual({
            address: "rye-bakery",
        });
    });

    it("refuses a missing or non-text address, and anything else sent", async () => {
        await expect(body({})).rejects.toBeInstanceOf(BadRequestException);
        await expect(body({ address: 42 })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(
            body({ address: "rye", organizationId: "org_2" }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe("who may change it", () => {
    const service = new WebAddressService();

    beforeEach(() => {
        isEnabled.mockReset();
        transaction.mockReset();
    });

    it.each(["ADMIN", "MEMBER", "REVIEWER"] as const)(
        "refuses %s (403) before anything is read",
        async (role) => {
            isEnabled.mockResolvedValue(true);
            await expect(
                service.change(ctx(role), "rye-bakery"),
            ).rejects.toBeInstanceOf(ForbiddenException);
            expect(isEnabled).not.toHaveBeenCalled();
            expect(transaction).not.toHaveBeenCalled();
        },
    );

    it("refuses the owner (403) while changing is not rolled out", async () => {
        isEnabled.mockResolvedValue(false);
        await expect(
            service.change(ctx("OWNER"), "rye-bakery"),
        ).rejects.toThrow(CHANGE_UNAVAILABLE_MESSAGE);
        expect(transaction).not.toHaveBeenCalled();
    });

    it.each([
        ["a--b", "An address can't have two hyphens in a row"],
        ["admin", "That address is kept for Saroh"],
        ["ab", "An address needs at least 3 characters"],
    ])("refuses %s (400) in the address rules' words", async (address, why) => {
        isEnabled.mockResolvedValue(true);
        const refusal = await service
            .change(ctx("OWNER"), address)
            .catch((e: unknown) => e);
        expect(refusal).toBeInstanceOf(BadRequestException);
        expect((refusal as BadRequestException).getResponse()).toMatchObject({
            message: why,
            details: { field: "address" },
        });
        expect(transaction).not.toHaveBeenCalled();
    });

    it("refuses the read to someone who can't see business details", async () => {
        for (const role of ["MEMBER", "REVIEWER"] as const) {
            await expect(service.read(ctx(role))).rejects.toBeInstanceOf(
                ForbiddenException,
            );
            await expect(
                service.availability(ctx(role), "rye"),
            ).rejects.toBeInstanceOf(ForbiddenException);
        }
    });
});
