import type { TemplateManifest } from "./manifest";
import { bakeryTemplateV1 } from "./templates/bakery";
import { bakeryTemplate } from "./templates/bakery-v2";
import { blogsTemplateV1 } from "./templates/blogs";
import { blogsTemplate } from "./templates/blogs-v2";
import { ceramicsTemplateV1 } from "./templates/ceramics";
import { ceramicsTemplate } from "./templates/ceramics-v2";
import { clinicTemplate, clinicTemplateV1 } from "./templates/clinic";
import { developerTemplate, developerTemplateV1 } from "./templates/developer";
import { dieticianTemplate, dieticianTemplateV1 } from "./templates/dietician";
import { gymTemplate, gymTemplateV1 } from "./templates/gym";
import { personalTemplate, personalTemplateV1 } from "./templates/personal";
import { portfolioTemplate, portfolioTemplateV1 } from "./templates/portfolio";
import { salonTemplate, salonTemplateV1 } from "./templates/salon";
import {
    starterTemplateV1,
    starterTemplateV2,
    starterTemplateV3,
} from "./templates/starter";
import { starterTemplateV4 } from "./templates/starter-v4";
import { starterTemplate } from "./templates/starter-v5";
import { studioTemplateV1 } from "./templates/studio";
import { studioTemplate } from "./templates/studio-v2";
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
 * added for someone working for themselves or showing their work (K15),
 * then the industry templates (industry templates plan, Phase B).
 */
const REGISTRY: Record<string, TemplateManifest> = Object.fromEntries(
    [
        starterTemplateV1,
        starterTemplateV2,
        starterTemplateV3,
        starterTemplateV4,
        starterTemplate,
        personalTemplateV1,
        personalTemplate,
        portfolioTemplateV1,
        portfolioTemplate,
        writingTemplate,
        blogsTemplateV1,
        blogsTemplate,
        ceramicsTemplateV1,
        ceramicsTemplate,
        gymTemplateV1,
        gymTemplate,
        bakeryTemplateV1,
        bakeryTemplate,
        studioTemplateV1,
        studioTemplate,
        developerTemplateV1,
        developerTemplate,
        dieticianTemplateV1,
        dieticianTemplate,
        salonTemplateV1,
        salonTemplate,
        clinicTemplateV1,
        clinicTemplate,
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
