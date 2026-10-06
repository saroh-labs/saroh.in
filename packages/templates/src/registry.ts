import type { TemplateManifest } from "./manifest";
import { ceramicsTemplate } from "./templates/ceramics";
import { personalTemplate } from "./templates/personal";
import { portfolioTemplate } from "./templates/portfolio";
import { starterTemplate, starterTemplateV1 } from "./templates/starter";
import { writingTemplate } from "./templates/writing";

/** Registry key for an `id@version` pair. */
function key(id: string, version: number): string {
    return `${id}@${version}`;
}

/**
 * All registered template manifests, keyed by `id@version`. Registering by
 * version (rather than by id alone) is what lets a template evolve — a new
 * version is added alongside the old one, and sites built from the old version
 * keep resolving it.
 *
 * In the order the picker offers them: the starter, then the three DEC-070
 * added for someone working for themselves or showing their work (K15).
 */
const REGISTRY: Record<string, TemplateManifest> = Object.fromEntries(
    [
        starterTemplateV1,
        starterTemplate,
        personalTemplate,
        portfolioTemplate,
        writingTemplate,
        ceramicsTemplate,
    ].map((t) => [key(t.id, t.version), t]),
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

/**
 * The templates a new site can start from: the LATEST version of each id, for
 * the template picker and the public catalogue. An older version stays in the
 * registry for the sites built from it, and `getTemplate(id, version)` still
 * finds it, but it is not offered again: listing both would show "Starter"
 * twice, and the picker keys its options by id.
 */
export function listTemplates(): TemplateManifest[] {
    const ids = [...new Set(Object.values(REGISTRY).map((t) => t.id))];
    return ids.flatMap((id) => {
        const latest = getTemplate(id);
        return latest ? [latest] : [];
    });
}
