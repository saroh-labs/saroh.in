/**
 * The summary tools' definitions and their period windows (plan
 * 2026-11-13-001, U4). The calls themselves run against Postgres in
 * `ai/tools/tool-bridge.db.spec.ts`.
 */
import { z } from "zod";

import type { McpActivityService } from "../activity.service";
import { openOutput } from "../open-output";
import type { McpTool } from "../tool-registry";
import { McpToolRegistry } from "../tool-registry";
import type { SummaryDeps } from "./summary.tools";
import { summaryTools, summaryWindow } from "./summary.tools";

const tools: McpTool[] = summaryTools({} as SummaryDeps);

/** The output schema as `tools/list` sends it (`openOutput`). */
const listedOutput = (t: McpTool) =>
    (
        openOutput(t.contract.output)["~standard"] as unknown as {
            jsonSchema: { output: (o: unknown) => unknown };
        }
    ).jsonSchema.output({ target: "draft-2020-12" });

describe("summary tool definitions", () => {
    it("are the five planned tools, and register beside the others", () => {
        expect(tools.map((t) => t.name)).toEqual([
            "get_business_summary",
            "get_whats_selling",
            "get_needs_attention",
            "find_lapsed_customers",
            "list_staff",
        ]);
        const registry = new McpToolRegistry({} as McpActivityService);
        registry.register(...tools);
        expect(registry.all()).toHaveLength(5);
    });

    it.each(tools.map((t) => [t.name, t]))(
        "%s: reads only, a 'Use this when…' description with an example and a when-not, strict input, open output",
        (_name, tool) => {
            expect(tool.description).toMatch(/^Use this when/);
            expect(tool.description).toMatch(/Example/);
            expect(tool.description).toMatch(/Not for/);
            expect(tool.description).not.toMatch(/plan|upgrade|pricing/i);
            expect(tool.hints.readOnlyHint).toBe(true);
            expect(tool.hints.destructiveHint).toBe(false);
            expect(tool.contract.input.safeParse({ surprise: 1 }).success).toBe(
                false,
            );
            expect("business" in tool.contract.input.shape).toBe(false);
            const listed = JSON.stringify(listedOutput(tool));
            expect(listed).not.toContain('"additionalProperties":false');
            // Small enough to send on every turn.
            const model = JSON.stringify({
                name: tool.name,
                description: tool.description,
                input: z.toJSONSchema(tool.contract.input, { io: "input" }),
            });
            expect(model.length / 4).toBeLessThan(350);
        },
    );
});

describe("summaryWindow", () => {
    // Thursday 13 Nov 2026, 10:00 in Kolkata.
    const now = new Date("2026-11-13T04:30:00Z");
    const zone = "Asia/Kolkata";

    it.each([
        ["today", "2026-11-13", "2026-11-13", "2026-11-12T18:30:00.000Z"],
        ["this_week", "2026-11-09", "2026-11-15", "2026-11-08T18:30:00.000Z"],
        ["last_week", "2026-11-02", "2026-11-08", "2026-11-01T18:30:00.000Z"],
        ["this_month", "2026-11-01", "2026-11-30", "2026-10-31T18:30:00.000Z"],
    ] as const)(
        "%s runs %s to %s in the business's zone",
        (period, first, last, from) => {
            const w = summaryWindow(period, now, zone);
            expect(w.firstDay).toBe(first);
            expect(w.lastDay).toBe(last);
            expect(w.from.toISOString()).toBe(from);
            expect(w.to.getTime()).toBeGreaterThan(w.from.getTime());
        },
    );
});
