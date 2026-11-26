import type { INestApplication } from "@nestjs/common";
import { Body, Controller, Post, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { IsOptional } from "class-validator";

import { AllExceptionsFilter } from "../filters/all-exceptions.filter";
import { validationPipeOptions } from "../validation";
import {
    BodyDepthPipe,
    MAX_BODY_DEPTH,
    nestsDeeperThan,
} from "./body-depth.pipe";

class AnyDto {
    @IsOptional()
    items?: unknown;
}

@Controller("public/echo")
class EchoController {
    @Post()
    echo(@Body() body: AnyDto) {
        return { ok: true, body };
    }
}

/** `[[[…]]]` nested `depth` arrays deep, as text. */
const nested = (depth: number) => "[".repeat(depth) + "]".repeat(depth);

describe("nestsDeeperThan", () => {
    it("counts objects and arrays, not values", () => {
        expect(nestsDeeperThan({ a: 1, b: "x" }, 1)).toBe(false);
        expect(nestsDeeperThan({ a: { b: [1] } }, 2)).toBe(true);
        expect(nestsDeeperThan({ a: { b: [1] } }, 3)).toBe(false);
        expect(nestsDeeperThan("text", 0)).toBe(false);
    });

    it("walks a very deep value without running out of stack", () => {
        expect(nestsDeeperThan(JSON.parse(nested(100_000)), 64)).toBe(true);
    });
});

describe("a body nested too deeply", () => {
    let app: INestApplication;
    let url: string;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [EchoController],
        }).compile();
        app = moduleRef.createNestApplication({ logger: false });
        // As main.ts sets them.
        app.useGlobalPipes(
            new BodyDepthPipe(),
            new ValidationPipe(validationPipeOptions),
        );
        app.useGlobalFilters(new AllExceptionsFilter());
        await app.listen(0, "127.0.0.1");
        url = await app.getUrl();
    });
    afterAll(() => app.close());

    const post = (body: string) =>
        fetch(`${url}/public/echo`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
        });

    it("answers 400 before validation, for an anonymous caller", async () => {
        const res = await post(`{"items":${nested(5_000)}}`);
        expect(res.status).toBe(400);
        expect(JSON.stringify(await res.json())).toContain("nested too deeply");
    });

    it("lets an ordinary body through", async () => {
        const res = await post(
            `{"items":${nested(MAX_BODY_DEPTH - 2).replace("[]", "[1]")}}`,
        );
        expect(res.status).toBe(201);
    });
});
