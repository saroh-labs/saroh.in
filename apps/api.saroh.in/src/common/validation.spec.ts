import "reflect-metadata";

import { BadRequestException, ValidationPipe } from "@nestjs/common";

import { ListAdminAuditDto, SetFlagDto } from "../modules/admin/dto";
import {
    CreateAutomationRuleDto,
    UpdateAutomationRuleDto,
} from "../modules/automations/dto";
import { CancelSubscriptionDto } from "../modules/billing/dto";
import { CreateServiceDto } from "../modules/bookings/dto";
import { CreatePostDto, UpdatePostDto } from "../modules/content/dto";
import { CreateFormDto } from "../modules/forms/dto";
import { validationPipeOptions } from "./validation";

/**
 * What the API accepts, at the boundary itself (#314).
 *
 * Every test here runs through the REAL `validationPipeOptions`, the same
 * object `main.ts` hands the global pipe, so none of it can drift from what the
 * running API does.
 *
 * ## The bug this file is the answer to
 *
 * The pipe ran with `enableImplicitConversion`, which coerces a value to the
 * property's declared type before any validator sees it. For a boolean that
 * coercion is TRUTHINESS: `"false"` became `true`, `"0"` became `true`, `"no"`
 * became `true`. `@IsBoolean()` was then handed a real boolean and passed.
 *
 * Nothing failed, nothing logged, and the caller got the opposite of what they
 * asked for. Three of the fields below decide whether an automation rule RUNS —
 * which sends real messages to real leads — and whether a billing change
 * applies immediately, which is money.
 *
 * `sites/dto.ts` had a per-field workaround (`@Transform(({ obj }) => obj.x)`)
 * and the seven fields here did not, because the workaround had to be
 * remembered rather than being the default. The conversion is off now, so the
 * plain decorator is the whole rule, and this table is what says so for every
 * field that was exposed.
 */

const pipe = new ValidationPipe(validationPipeOptions);

const body = (metatype: new (...args: never[]) => unknown) => ({
    type: "body" as const,
    metatype,
});
const query = (metatype: new (...args: never[]) => unknown) => ({
    type: "query" as const,
    metatype,
});

/** Everything a truthy coercion used to turn into `true`. */
const NOT_A_BOOLEAN = [
    ['the string "false"', "false"],
    ['the string "true"', "true"],
    ['the string "0"', "0"],
    ['the string "no"', "no"],
    ["the number 1", 1],
    ["the number 0", 0],
] as const;

/**
 * Every boolean the API takes in a body, and the payload it sits in.
 *
 * The extra fields are whatever else the DTO requires — a rule is not valid
 * without a trigger, a post without a title — so that each case fails for the
 * boolean and not for something missing.
 */
const BOOLEAN_FIELDS: {
    what: string;
    dto: new (...args: never[]) => unknown;
    field: string;
    rest: Record<string, unknown>;
}[] = [
    {
        what: "whether an automation rule runs",
        dto: CreateAutomationRuleDto,
        field: "enabled",
        rest: {
            name: "Chase new leads",
            trigger: "lead.created",
            action: "send.message",
            config: {},
        },
    },
    {
        what: "whether an automation rule keeps running",
        dto: UpdateAutomationRuleDto,
        field: "enabled",
        rest: {},
    },
    {
        what: "whether a subscription change applies now",
        dto: CancelSubscriptionDto,
        field: "immediate",
        rest: {},
    },
    {
        what: "whether a post is featured",
        dto: CreatePostDto,
        field: "featured",
        rest: { title: "Cutting packaging costs" },
    },
    {
        what: "whether a post stays featured",
        dto: UpdatePostDto,
        field: "featured",
        rest: { title: "Cutting packaging costs", slug: "cutting-costs" },
    },
    {
        what: "whether a platform feature flag is on",
        dto: SetFlagDto,
        field: "enabled",
        rest: {
            reason: "Rolling out to the pilot org",
            idempotencyKey: "flag-rollout-0001",
        },
    },
];

describe("a boolean field takes a boolean, and nothing else", () => {
    for (const { what, dto, field, rest } of BOOLEAN_FIELDS) {
        describe(`${dto.name}.${field} — ${what}`, () => {
            it("accepts true and false", async () => {
                await expect(
                    pipe.transform({ ...rest, [field]: true }, body(dto)),
                ).resolves.toMatchObject({ [field]: true });
                await expect(
                    pipe.transform({ ...rest, [field]: false }, body(dto)),
                ).resolves.toMatchObject({ [field]: false });
            });

            it.each(NOT_A_BOOLEAN)("refuses %s", async (_label, value) => {
                await expect(
                    pipe.transform({ ...rest, [field]: value }, body(dto)),
                ).rejects.toBeInstanceOf(BadRequestException);
            });
        });
    }

    /*
     * A field nested inside an array, which is where a conversion bug is
     * hardest to see: the form's own shape is valid, one field inside one
     * element is not.
     */
    it('refuses "false" for a form field\'s required flag', async () => {
        const form = (required: unknown) => ({
            name: "Enquiry",
            fields: [
                { name: "email", label: "Email", type: "email", required },
            ],
        });
        await expect(
            pipe.transform(form(true), body(CreateFormDto)),
        ).resolves.toBeDefined();
        await expect(
            pipe.transform(form("false"), body(CreateFormDto)),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

/**
 * The other half of turning conversion off: a number in a BODY is already a
 * number, so nothing converts it, and a string is now refused rather than
 * quietly parsed.
 */
describe("a number in a body is a number", () => {
    const service = (durationMinutes: unknown) => ({
        name: "Warehouse walkthrough",
        timezone: "Asia/Kolkata",
        durationMinutes,
    });

    it("accepts a number", async () => {
        await expect(
            pipe.transform(service(60), body(CreateServiceDto)),
        ).resolves.toMatchObject({ durationMinutes: 60 });
    });

    it('refuses "60", which used to be parsed silently', async () => {
        // JSON can carry a number. A client sending a string is a client with
        // a bug, and the 400 is where they find out.
        await expect(
            pipe.transform(service("60"), body(CreateServiceDto)),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("still refuses a number outside its bounds", async () => {
        await expect(
            pipe.transform(service(0), body(CreateServiceDto)),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            pipe.transform(service(1441), body(CreateServiceDto)),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

/**
 * And the one place text genuinely arrives where a number is declared: a query
 * string, which has no types at all.
 */
describe("a number in a query string converts explicitly", () => {
    it("reads ?limit=50 as 50", async () => {
        await expect(
            pipe.transform({ limit: "50" }, query(ListAdminAuditDto)),
        ).resolves.toMatchObject({ limit: 50 });
    });

    it("refuses a limit that is not a number, rather than defaulting", async () => {
        await expect(
            pipe.transform({ limit: "all" }, query(ListAdminAuditDto)),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("still enforces the bounds after converting", async () => {
        await expect(
            pipe.transform({ limit: "0" }, query(ListAdminAuditDto)),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            pipe.transform({ limit: "101" }, query(ListAdminAuditDto)),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
