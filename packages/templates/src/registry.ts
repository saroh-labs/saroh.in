import type { TemplateManifest } from "./manifest";
import { starterTemplate } from "./templates/starter";

/** Registry key for an `id@version` pair. */
function key(id: string, version: number): string {
    return `${id}@${version}`;
}

/**
 * All registered template manifests, keyed by `id@version`. Registering by
 * version (rather than by id alone) is what lets a template evolve — a new
 * version is added alongside the old one, and sites built from the old version
 * keep resolving it.
 */
const REGISTRY: Record<string, TemplateManifest> = Object.fromEntries(
    [starterTemplate].map((t) => [key(t.id, t.version), t]),
);

/** The highest registered version for a given template id, or `undefined`. */
function latestVersion(id: string): number | undefined {
    const versions = Object.values(REGISTRY)
        .filter((t) => t.id === id)
        .map((t) => t.version);
    return versions.length > 0 ? Math.max(...versions) : undefined;
}

/**
 * Look up a template by `id`. With `version`, returns that exact version; without
 * it, returns the latest registered version. `undefined` if none matches.
 */
export function getTemplate(
    id: string,
    version?: number,
): TemplateManifest | undefined {
    const resolvedVersion = version ?? latestVersion(id);
    if (resolvedVersion === undefined) return undefined;
    return REGISTRY[key(id, resolvedVersion)];
}

/** Every registered template manifest (e.g. for a template picker). */
export function listTemplates(): TemplateManifest[] {
    return Object.values(REGISTRY);
}
