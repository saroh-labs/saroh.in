import type { AlsoIcon, ChipIcon } from "../schema";

/* The icons design D draws: the hero's chips (17px) and "Also in Saroh" (20px). Decorative. */

const CHIP: Record<ChipIcon, React.ReactNode> = {
    cal: (
        <>
            <rect x="3" y="4" width="18" height="17" rx="2" />
            <path d="M8 2v4M16 2v4M3 10h18" />
        </>
    ),
    ok: <path d="m5 12 5 5 9-10" />,
    bill: (
        <>
            <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
            <path d="M9 7h6M9 11h6M9 15h4" />
        </>
    ),
    person: (
        <>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
        </>
    ),
};

export function ChipSvg({ icon }: { icon: ChipIcon }) {
    return (
        <svg
            aria-hidden="true"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={icon === "ok" ? 2.4 : 2}
        >
            {CHIP[icon]}
        </svg>
    );
}

const ALSO: Record<AlsoIcon, React.ReactNode> = {
    pack: (
        <>
            <rect x="3" y="6" width="18" height="13" rx="2" />
            <path d="M7 6V4h10v2M3 11h18" />
        </>
    ),
    clock: (
        <>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v4l3 2" />
        </>
    ),
    link: (
        <>
            <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
            <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
        </>
    ),
    shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
    calendar: (
        <>
            <rect x="4" y="5" width="16" height="15" rx="2" />
            <path d="M4 10h16M9 3v4M15 3v4" />
        </>
    ),
    noshow: (
        <>
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
            <path d="M5 5 19 19" />
        </>
    ),
    list: (
        <>
            <path d="M9 6h12M9 12h12M9 18h12" />
            <path d="M4 6h.01M4 12h.01M4 18h.01" />
        </>
    ),
    video: (
        <>
            <rect x="2" y="6" width="14" height="12" rx="2" />
            <path d="m22 8-6 4 6 4z" />
        </>
    ),
    printer: (
        <>
            <path d="M6 9V3h12v6" />
            <rect x="3" y="9" width="18" height="8" rx="2" />
            <path d="M7 14h10v7H7z" />
        </>
    ),
    truck: (
        <>
            <path d="M2 6h12v10H2zM14 10h4l3 3v3h-7" />
            <circle cx="6" cy="18" r="2" />
            <circle cx="17" cy="18" r="2" />
        </>
    ),
    bill: (
        <>
            <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
            <path d="M9 7h6M9 11h6M9 15h4" />
        </>
    ),
    person: (
        <>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
        </>
    ),
    layers: (
        <>
            <path d="m12 3 9 5-9 5-9-5z" />
            <path d="m3 13 9 5 9-5" />
        </>
    ),
    lock: (
        <>
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </>
    ),
};

export function AlsoSvg({ icon }: { icon: AlsoIcon }) {
    return (
        <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--sp-amber-text)"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {ALSO[icon]}
        </svg>
    );
}
