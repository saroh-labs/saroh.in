import type { z } from "zod";

type Json = Record<string, unknown>;

/**
 * A tool's output schema as AI apps are told it, open to fields added later.
 *
 * Zod writes `additionalProperties: false` on every object. Claude.ai keeps
 * the tool list from when the connector connected and checks each answer
 * against it, so a field we add later (list_templates' preview_url, 13 Nov)
 * fails every call until the person reconnects. Without `false`, an older
 * list still accepts a newer answer. Our own check is unchanged: answers are
 * still validated against the contract's Zod schema.
 */
export function openOutput<T extends z.ZodType>(schema: T): T {
    const std = schema["~standard"];
    const listed = (opts: unknown) =>
        open(
            (
                std as unknown as {
                    jsonSchema: { output: (o: unknown) => Json };
                }
            ).jsonSchema.output(opts),
        );
    // shortcut: overrides only the listed form; the SDK reads nothing else from it.
    return Object.create(schema, {
        "~standard": {
            value: { ...std, jsonSchema: { input: listed, output: listed } },
        },
    }) as T;
}

function open(node: unknown): Json {
    if (Array.isArray(node)) return node.map(open) as unknown as Json;
    if (!node || typeof node !== "object") return node as Json;
    const out: Json = {};
    for (const [key, value] of Object.entries(node)) {
        if (key === "additionalProperties" && value === false) continue;
        out[key] = open(value);
    }
    return out;
}
