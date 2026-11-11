/**
 * The U12 tool definitions (plan 2026-11-10-001): what every catalogue and
 * day-to-day tool must carry, their size, and module gating. The calls
 * themselves run against Postgres in `catalogue-day.tools.db.spec.ts`.
 */
import { z } from "zod";

import type { OrganizationContext } from "../../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../../capabilities/module-availability.service";
import type { CatalogueV1Controller } from "../../public-api/catalogue.v1.controller";
import type { McpActivityService } from "../activity.service";
import type { McpCall, McpTool } from "../tool-registry";
import { McpToolRegistry } from "../tool-registry";
import { catalogueTools } from "./catalogue.tools";
import type { DayDeps } from "./day.tools";
import { dayTools } from "./day.tools";

const tools: McpTool[] = [
    ...catalogueTools({} as CatalogueV1Controller),
    ...dayTools({} as DayDeps),
];

/** What `tools/list` sends for a tool, as the SDK lists it. */
const listed = (t: McpTool) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: z.toJSONSchema(t.contract.input, { io: "input" }),
    outputSchema: z.toJSONSchema(t.contract.output),
    annotations: { title: t.title, ...t.hints },
});

// A rough count: about four characters a token for JSON and English.
const tokensOf = (value: unknown) =>
    Math.ceil(JSON.stringify(value).length / 4);

describe("U12 tool definitions", () => {
    it("are the 24 planned tools, each named once", () => {
        expect(tools.map((t) => t.name).sort()).toEqual(
            [
                "list_products",
                "get_product",
                "create_product",
                "update_product",
                "list_services",
                "create_service",
                "update_service",
                "get_hours",
                "set_hours",
                "list_bookings",
                "get_booking",
                "find_free_slots",
                "create_booking",
                "move_booking",
                "list_orders",
                "get_order",
                "create_order",
                "update_order_status",
                "list_customers",
                "get_customer",
                "create_customer",
                "update_customer",
                "list_enquiries",
                "get_enquiry",
            ].sort(),
        );
    });

    it.each(tools.map((t) => [t.name, t]))(
        "%s: title, a 'Use this when…' description with an example and a when-not, all four hints, a capability",
        (_name, tool) => {
            expect(tool.title.length).toBeGreaterThan(3);
            expect(tool.description).toMatch(/^Use this when/);
            expect(tool.description).toMatch(/Example/);
            expect(tool.description).toMatch(
                /\b(Not for|not for|Never|Don't|first|use \w+_\w+|Check list_)/,
            );
            for (const hint of [
                "readOnlyHint",
                "destructiveHint",
                "idempotentHint",
                "openWorldHint",
            ] as const) {
                expect(typeof tool.hints[hint]).toBe("boolean");
            }
            expect(tool.capability).not.toBeNull();
            // Nothing here deletes, refunds or cancels.
            expect(tool.hints.destructiveHint).toBe(false);
            // Results never talk plans or upgrades.
            expect(tool.description).not.toMatch(/plan|upgrade|pricing/i);
        },
    );

    it("every create takes a request_id; only list, get and find read", () => {
        for (const tool of tools) {
            const shape = tool.contract.input.shape as Record<string, unknown>;
            expect("request_id" in shape).toBe(tool.name.startsWith("create_"));
            expect(tool.hints.readOnlyHint).toBe(
                /^(list|get|find)_/.test(tool.name),
            );
        }
    });

    it("refuses an unknown argument (strict inputs)", () => {
        for (const tool of tools) {
            expect(
                tool.contract.input.safeParse({ surprise: true }).success,
            ).toBe(false);
        }
    });

    it("stay small: what the model reads is under 6K tokens together, none over 350", () => {
        // A model is given name, description and input schema (Claude's
        // tool format has no output schema); the full listing is logged.
        const model = (t: McpTool) => ({
            name: t.name,
            description: t.description,
            input_schema: z.toJSONSchema(t.contract.input, { io: "input" }),
        });
        const sizes = tools.map((t) => [t.name, tokensOf(model(t))] as const);
        const total = sizes.reduce((sum, [, n]) => sum + n, 0);
        const listing = tools.reduce((sum, t) => sum + tokensOf(listed(t)), 0);
        // Printed so a change that grows them shows in the run.
        console.info(
            `U12 tools: ~${total} tokens to the model; ~${listing} for the whole tools/list`,
            sizes,
        );
        expect(total).toBeLessThan(6_000);
        for (const [, n] of sizes) expect(n).toBeLessThan(350);
    });
});

describe("module gating", () => {
    const ctx: OrganizationContext = {
        organizationId: "org_1",
        userId: "user_1",
        role: "OWNER",
    };
    const call = {
        ctx,
        connection: {
            kind: "key",
            id: "k1",
            clientName: null,
            businesses: ["org_1"],
            context: ctx,
        },
    } as McpCall;
    const before = process.env.MODULE_ENFORCEMENT;
    afterEach(() => {
        process.env.MODULE_ENFORCEMENT = before;
    });

    function registryWith(off: string[]) {
        const evaluate = jest.fn(
            async ({ moduleKey }: { moduleKey: string }) => ({
                gatesPassed: !off.includes(moduleKey),
            }),
        );
        const registry = new McpToolRegistry(
            {} as McpActivityService,
            { evaluate } as unknown as ModuleAvailabilityService,
        );
        registry.register(...tools);
        return { registry, evaluate };
    }

    const listedNames = async (registry: McpToolRegistry) => {
        const modulesOff = await registry.modulesOff(ctx);
        return registry
            .all()
            .filter(
                (t) =>
                    registry.allows(t, ctx) &&
                    !(t.module && modulesOff.has(t.module)),
            )
            .map((t) => t.name);
    };

    it("hides and refuses a module's tools while it is off for the business", async () => {
        process.env.MODULE_ENFORCEMENT = "true";
        const { registry } = registryWith(["COMMERCE"]);
        const names = await listedNames(registry);
        expect(names).not.toContain("create_product");
        expect(names).not.toContain("update_order_status");
        // Reads with no module of their own stay.
        expect(names).toContain("list_orders");
        expect(names).toContain("create_booking");

        const tool = registry.all().find((t) => t.name === "create_product");
        const answer = await registry.call(
            tool as McpTool,
            { request_id: "r1", name: "Loaf", price: 1 },
            call,
            null,
        );
        expect(answer).toMatchObject({ isError: true });
        expect(JSON.stringify(answer)).not.toMatch(/plan|upgrade/i);
        expect(JSON.stringify(answer)).toMatch(/off for this business/);
    });

    it("hides nothing while module enforcement isn't on, as the /v1 guard", async () => {
        process.env.MODULE_ENFORCEMENT = "shadow";
        const { registry, evaluate } = registryWith([
            "COMMERCE",
            "APPOINTMENTS",
        ]);
        expect(await listedNames(registry)).toHaveLength(tools.length);
        expect(evaluate).not.toHaveBeenCalled();
    });
});
