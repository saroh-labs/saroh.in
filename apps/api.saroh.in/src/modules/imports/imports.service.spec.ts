// A refused import names what is wrong with the file, and that list reaches
// the wire: the error filter forwards only `message` and `details`, so the
// file's problems must travel in `details.fileIssues`. Mocked Prisma, no DB.
jest.mock("@saroh/database", () => ({
    prisma: {
        product: { findMany: jest.fn().mockResolvedValue([]) },
        customer: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn(),
    },
}));

import { BadRequestException, type ArgumentsHost } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import type { StoresService } from "../stores/stores.service";
import { ImportsService } from "./imports.service";

function makeService() {
    const stores = {
        writableOrganization: jest
            .fn()
            .mockResolvedValue({ organizationId: "org_1" }),
    } as unknown as StoresService;
    return new ImportsService(stores);
}

/** What the filter would send for `error`. */
function onTheWire(error: unknown): unknown {
    let body: unknown;
    const res: { headersSent: boolean; [k: string]: unknown } = {
        headersSent: false,
    };
    res.setHeader = jest.fn();
    res.status = jest.fn(() => res);
    res.json = jest.fn((b: unknown) => {
        body = b;
        return res;
    });
    const host = {
        switchToHttp: () => ({
            getResponse: () => res,
            getRequest: () => ({
                method: "POST",
                originalUrl: "/stores/s/imports/products/apply",
                correlationId: "cid-1",
                headers: {},
            }),
        }),
    } as unknown as ArgumentsHost;
    new AllExceptionsFilter().catch(error, host);
    return body;
}

describe("ImportsService.apply — a refused file", () => {
    // A file with no column mapped to the price a product needs.
    const dto = {
        csv: "name\nRose Serum\n",
        mapping: { name: "name" },
        policy: "SKIP" as const,
    };

    it("lists the file's problems in details.fileIssues, and writes nothing", async () => {
        const refused = await makeService()
            .apply("store_1", "user_1", "products", dto)
            .catch((e: unknown) => e);

        expect(refused).toBeInstanceOf(BadRequestException);
        expect((refused as BadRequestException).getResponse()).toMatchObject({
            message: "This file cannot be imported as mapped",
            details: {
                fileIssues: [expect.objectContaining({ field: "price" })],
            },
        });
        expect(prisma.$transaction).not.toHaveBeenCalled();

        expect(onTheWire(refused)).toMatchObject({
            error: {
                message: "This file cannot be imported as mapped",
                details: {
                    fileIssues: [
                        expect.objectContaining({ row: 0, field: "price" }),
                    ],
                },
            },
        });
    });
});
