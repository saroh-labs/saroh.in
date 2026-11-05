/**
 * The marks of Saroh's own accounts, by the label each site gives them.
 * Line drawings in `currentColor` (the outlines follow Tabler Icons, MIT),
 * so nothing is fetched from a network and none wears its brand colour.
 */
const SOCIAL_MARKS: Readonly<Record<string, readonly string[]>> = {
    Instagram: [
        "M4 8a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4z",
        "M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0",
        "M16.5 7.5v.01",
    ],
    X: [
        "M4 4l11.733 16h4.267l-11.733 -16z",
        "M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772",
    ],
    YouTube: [
        "M2 8a4 4 0 0 1 4 -4h12a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-12a4 4 0 0 1 -4 -4z",
        "M10 9l5 3l-5 3z",
    ],
    LinkedIn: [
        "M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z",
        "M8 11v5",
        "M8 8v.01",
        "M12 16v-5",
        "M16 16v-3a2 2 0 0 0 -4 0",
    ],
    GitHub: [
        "M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5",
    ],
};

export function SocialMark({ label }: { label: string }) {
    return (
        <svg
            aria-hidden
            viewBox="0 0 24 24"
            width={20}
            height={20}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {(SOCIAL_MARKS[label] ?? []).map((d) => (
                <path key={d} d={d} />
            ))}
        </svg>
    );
}
