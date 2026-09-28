import { z } from "zod";

/**
 * Typed decoding for the modular-capabilities API (ADR-003 / #115). The server
 * is the single source of truth; this schema only *validates* what it returns
 * so a shape drift fails loudly instead of rendering garbage. Blocker codes are
 * left as free strings (the server owns the stable set); the UI maps known ones
 * to copy and passes unknown ones through safely.
 */
export const MODULE_LIFECYCLE = ["DISABLED", "ENABLED", "ARCHIVED"] as const;
export type ModuleLifecycle = (typeof MODULE_LIFECYCLE)[number];

export const MODULE_READINESS = [
    "DISABLED",
    "SETUP_REQUIRED",
    "ACTIVE",
    "ATTENTION_REQUIRED",
] as const;
export type ModuleReadiness = (typeof MODULE_READINESS)[number];

export const moduleBlockerSchema = z.object({
    code: z.string(),
    message: z.string().optional(),
    actionHref: z.string().optional(),
});
export type ModuleBlocker = z.infer<typeof moduleBlockerSchema>;

export const moduleViewSchema = z.object({
    key: z.string(),
    label: z.string(),
    lifecycle: z.enum(MODULE_LIFECYCLE),
    readiness: z.enum(MODULE_READINESS),
    selectedForProject: z.boolean(),
    canManage: z.boolean(),
    dependencies: z.array(z.string()).default([]),
    blockers: z.array(moduleBlockerSchema),
});
export type ModuleView = z.infer<typeof moduleViewSchema>;

export const moduleListSchema = z.object({
    data: z.array(moduleViewSchema),
    meta: z.object({
        organizationId: z.string(),
        projectId: z.string().optional(),
    }),
});

export const moduleMutationResponseSchema = z.object({
    data: moduleViewSchema,
});

/**
 * `GET /modules/:key/impact` (F13): what turning a module off touches, with
 * real counts. `count` is null when the API couldn't read it (the message
 * says so) and absent when there is nothing to count, or the viewer may not
 * read it. The messages are the API's sentences; blockers still refuse.
 */
export const moduleImpactSchema = z.object({
    moduleKey: z.string(),
    enabled: z.boolean(),
    goesWith: z.array(z.string()),
    items: z.array(
        z.object({
            code: z.string(),
            moduleKey: z.string(),
            count: z.number().int().nullable().optional(),
            message: z.string(),
        }),
    ),
    blockers: z.array(moduleBlockerSchema),
});
export type ModuleImpact = z.infer<typeof moduleImpactSchema>;

export const moduleImpactResponseSchema = z.object({
    data: moduleImpactSchema,
});

/** Decode a `GET /modules` response into the module list. */
export function decodeModuleList(raw: unknown): ModuleView[] {
    return moduleListSchema.parse(raw).data;
}
