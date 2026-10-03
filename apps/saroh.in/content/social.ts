/**
 * Saroh's own accounts (owner, 2026-10-03; settles the claims ledger's D12).
 * One list for the site footer, the waitlist footer and the Organization
 * structured data, so a handle changes in one place.
 */
export interface SocialLink {
    label: string;
    href: string;
}

/** The handle Saroh uses where the network allows it. */
export const SAROH_HANDLE = "@sarohlabs";

/** The public source code. */
export const SAROH_REPO_URL = "https://github.com/saroh-labs/saroh.in";

export const SAROH_SOCIAL: readonly SocialLink[] = [
    { label: "Instagram", href: "https://www.instagram.com/sarohlabs" },
    { label: "X", href: "https://x.com/sarohlabs" },
    { label: "YouTube", href: "https://www.youtube.com/@SarohLabs" },
    { label: "LinkedIn", href: "https://www.linkedin.com/company/saroh" },
    { label: "GitHub", href: SAROH_REPO_URL },
];
