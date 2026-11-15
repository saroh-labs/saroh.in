import { z } from "zod";

import { openOutput } from "./open-output";

describe("tool output schemas as AI apps are told them", () => {
    const output = z.object({
        templates: z.array(z.object({ id: z.string() })),
    });
    const listed = (s: z.ZodType) =>
        (
            s["~standard"] as unknown as {
                jsonSchema: { output: (o: unknown) => unknown };
            }
        ).jsonSchema.output({ target: "draft-2020-12" });

    it("drops additionalProperties: false at every depth, so an older tool list accepts a newer answer", () => {
        expect(JSON.stringify(listed(output))).toContain(
            '"additionalProperties":false',
        );
        const open = JSON.stringify(listed(openOutput(output)));
        expect(open).not.toContain("additionalProperties");
        expect(open).toContain('"templates"');
    });

    it("still checks answers against the contract", async () => {
        const std = openOutput(output)["~standard"];
        expect(
            await std.validate({ templates: [{ id: "salon" }] }),
        ).not.toHaveProperty("issues");
        expect(await std.validate({ templates: [{}] })).toHaveProperty(
            "issues",
        );
        expect(openOutput(output).parse({ templates: [] })).toEqual({
            templates: [],
        });
    });
});
