import { BadRequestException } from "@nestjs/common";
import type { SocialLinks, SocialNetwork } from "@saroh/block-contract";
import {
    normaliseSocialLink,
    parseSocialLinks,
    SOCIAL_NETWORKS,
} from "@saroh/block-contract";

/**
 * A business's social links (DEC-125): its accounts on a fixed list of
 * networks, the same on its website and anywhere else they are shown later.
 *
 * Kept on the business profile as one canonical https address per network,
 * each on that network's own host. The rules are `@saroh/block-contract`'s
 * (`social-links.ts`), shared with the workspace and the site, so the three
 * can never disagree about what a link may be. Nothing typed is stored as
 * typed, and no other address is accepted: an arbitrary link on a
 * merchant's page is a phishing and brand-safety hole.
 */

/** What a save may send: a handle or a link per network, "" to clear it. */
export type SocialLinksInput = Partial<Record<SocialNetwork, string>>;

/** The field a refusal names, so the sheet puts it under the right input. */
export const socialField = (network: SocialNetwork) => `socialLinks.${network}`;

/**
 * The settings save's write: the stored links with what was sent applied.
 * A network left out stays as it is, "" clears it, anything else is
 * rebuilt into its canonical address or refused on its field. Nothing sent:
 * nothing to write.
 */
export function socialLinksWrite(
    sent: SocialLinksInput | undefined,
    stored: unknown,
): { socialLinks?: SocialLinks } {
    if (!sent) return {};
    const touched = SOCIAL_NETWORKS.filter((n) => sent[n] !== undefined);
    if (touched.length === 0) return {};
    const links = parseSocialLinks(stored);
    for (const network of touched) {
        const typed = (sent[network] ?? "").trim();
        if (typed === "") {
            delete links[network];
            continue;
        }
        const check = normaliseSocialLink(network, typed);
        if (!check.ok) {
            throw new BadRequestException({
                message: check.problem,
                details: { field: socialField(network) },
            });
        }
        links[network] = check.url;
    }
    return { socialLinks: links };
}

/**
 * Stored links as anyone may read them. Re-checked on the way out rather
 * than trusted, as the public phone and the week are: a value that isn't a
 * network's own canonical address is left out, never served.
 */
export function socialLinksRead(stored: unknown): SocialLinks {
    return parseSocialLinks(stored);
}
