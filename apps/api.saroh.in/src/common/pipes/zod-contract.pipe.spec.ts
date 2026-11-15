import { BadRequestException, type ArgumentsHost } from "@nestjs/common";
import { money, pageQuery } from "@saroh/api-contract";
import { z } from "zod";

import { AllExceptionsFilter } from "../filters/all-exceptions.filter";
import { ZodContractPipe } from "./zod-contract.pipe";

const body = z.strictObject({ name: z.string().min(1), price: money });

function refusal(run: () => unknown): { status: number; response: unknown } {
    try {
        run();
    } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        const http = error as BadRequestException;
        return { status: http.getStatus(), response: http.getResponse() };
    }
    throw new Error("expected a refusal");
}

describe("ZodContractPipe", () => {
    it("passes a valid body through unchanged", () => {
        const value = {
            name: "Rose oil",
            price: { amountMinor: 49_900, currency: "INR" },
        };
        expect(
            new ZodContractPipe(body).transform(value, { type: "body" }),
        ).toEqual(value);
    });

    it("refuses an unknown field with invalid_request and its path", () => {
        const { status, response } = refusal(() =>
            new ZodContractPipe(body).transform(
                {
                    name: "Rose oil",
                    price: { amountMinor: 100, currency: "INR", tax: 1 },
                },
                { type: "body" },
            ),
        );
        expect(status).toBe(400);
        expect(response).toEqual({
            error: {
                code: "invalid_request",
                message: "body.price.tax: Unknown field",
            },
        });
    });

    it("refuses a fractional minor unit", () => {
        const { response } = refusal(() =>
            new ZodContractPipe(body).transform(
                {
                    name: "Rose oil",
                    price: { amountMinor: 1.5, currency: "INR" },
                },
                { type: "body" },
            ),
        );
        expect(JSON.stringify(response)).toContain("body.price.amountMinor");
    });

    it("refuses a cursor that isn't base64url, and converts limit", () => {
        const pipe = new ZodContractPipe(pageQuery);
        const { status, response } = refusal(() =>
            pipe.transform({ cursor: "not a cursor!" }, { type: "query" }),
        );
        expect(status).toBe(400);
        expect(response).toEqual({
            error: {
                code: "invalid_request",
                message: "query.cursor: Not a valid cursor",
            },
        });
        expect(pipe.transform({ limit: "10" }, { type: "query" })).toEqual({
            limit: 10,
        });
    });

    it("reaches the caller in the contract's shape, with the request id", () => {
        const { response } = refusal(() =>
            new ZodContractPipe(body).transform({}, { type: "body" }),
        );
        const res = {
            headersSent: false,
            setHeader: jest.fn(),
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        const host = {
            switchToHttp: () => ({
                getResponse: () => res,
                getRequest: () => ({
                    method: "POST",
                    originalUrl: "/v1/products",
                    correlationId: "req_1",
                    headers: {},
                }),
            }),
        } as unknown as ArgumentsHost;

        new AllExceptionsFilter().catch(
            new BadRequestException(response),
            host,
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: {
                code: "invalid_request",
                message: expect.stringContaining("body.name"),
                requestId: "req_1",
            },
        });
    });
    it("refuses a NUL character anywhere with invalid_request, before the schema", () => {
        const { status, response } = refusal(() =>
            new ZodContractPipe(body).transform(
                {
                    name: "Rose\u0000oil",
                    price: { amountMinor: 1, currency: "INR" },
                },
                { type: "body" },
            ),
        );
        expect(status).toBe(400);
        expect(response).toEqual({
            error: {
                code: "invalid_request",
                message: "body.name: Must not contain a NUL character",
            },
        });
        expect(
            refusal(() =>
                new ZodContractPipe(z.string()).transform("x\u0000", {
                    type: "param",
                }),
            ).response,
        ).toMatchObject({ error: { code: "invalid_request" } });
    });
});
