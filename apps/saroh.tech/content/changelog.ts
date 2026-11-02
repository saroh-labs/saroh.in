export interface ChangelogEntry {
    slug: string;
    /** yyyy-mm-dd */
    date: string;
    title: string;
    summary: string;
    /** Global: saroh.tech only. Both: saroh.tech and saroh.in. */
    tag: "Global" | "Both";
    try?: { label: string; href: string };
    /** Not a real change yet: every surface must label it. */
    example?: boolean;
}

/** Newest first. Real changes only: the one below is an Example until the owner replaces it. */
export const CHANGELOG: ChangelogEntry[] = [
    {
        slug: "six-free-tools",
        date: "2026-11-02",
        title: "Six free tools are live",
        summary:
            "Invoice generator, quote maker, receipt maker, payment reminder writer, late fee calculator and a VAT, sales tax and GST calculator. No sign-up, no watermark.",
        tag: "Global",
        try: { label: "Try the tools", href: "/tools" },
        example: true,
    },
];

export const changelogPath = (e: Pick<ChangelogEntry, "date" | "slug">) =>
    `/changelog/${e.date}-${e.slug}`;
