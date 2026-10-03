import type { FaqItem, Feature, Solution } from "./types";
import { FEATURE_SLUGS, SOLUTION_SLUGS } from "./types";

/**
 * Every broken cross-link in the content model, as readable lines: a page
 * without its words, a shot key missing from the manifest, a "Works with"
 * card or "Used by" chip naming a page that does not exist. Empty means
 * sound. `content.test.ts` runs it on the real content and on broken copies,
 * so the check itself is pinned.
 */
export function contentErrors({
    features,
    solutions,
    shots,
    faqs,
}: {
    features: Partial<Record<string, Feature>>;
    solutions: Partial<Record<string, Solution>>;
    shots: Record<string, unknown>;
    faqs: Record<string, FaqItem>;
}): string[] {
    const errors: string[] = [];
    const isFeature = (s: string) => s in features;
    const isSolution = (s: string) => s in solutions;
    const hasShot = (k: string) => k in shots;

    for (const slug of FEATURE_SLUGS) {
        const f = features[slug];
        if (!f) {
            errors.push(`feature ${slug}: missing`);
            continue;
        }
        if (!f.headline.trim()) errors.push(`feature ${slug}: no headline`);
        if (!f.sub.trim()) errors.push(`feature ${slug}: no sub`);
        if (!f.steps.length) errors.push(`feature ${slug}: no steps`);
        for (const ref of [f.hero, ...f.steps]) {
            if (!hasShot(ref.shot)) {
                errors.push(
                    `feature ${slug}: shot ${ref.shot} not in shots.ts`,
                );
            }
        }
        for (const other of f.worksWith) {
            if (!isFeature(other)) {
                errors.push(`feature ${slug}: works with missing ${other}`);
            }
        }
        for (const s of f.usedBy) {
            if (!isSolution(s)) {
                errors.push(`feature ${slug}: used by missing ${s}`);
            }
        }
    }
    for (const slug of SOLUTION_SLUGS) {
        const s = solutions[slug];
        if (!s) {
            errors.push(`solution ${slug}: missing`);
            continue;
        }
        if (!s.headline.trim()) errors.push(`solution ${slug}: no headline`);
        if (!s.sub.trim()) errors.push(`solution ${slug}: no sub`);
        if (!s.segments.length) errors.push(`solution ${slug}: no segments`);
        for (const ref of [s.hero, ...s.segments]) {
            if (!hasShot(ref.shot)) {
                errors.push(
                    `solution ${slug}: shot ${ref.shot} not in shots.ts`,
                );
            }
        }
        for (const seg of s.segments) {
            if (!isFeature(seg.feature)) {
                errors.push(
                    `solution ${slug}: segment names missing ${seg.feature}`,
                );
            }
        }
        if (!(s.faq in faqs)) {
            errors.push(`solution ${slug}: question ${s.faq} not in faq.ts`);
        }
    }
    return errors;
}
