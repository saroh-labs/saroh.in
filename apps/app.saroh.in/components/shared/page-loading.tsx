import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import { Skeleton } from "@saroh/ui/skeleton";
import type { ReactNode } from "react";

import { PageContainer } from "@/components/shared/page-container";

/** The widths a page sits at: `PageContainer`'s own. */
export type PageWidth = "form" | "default" | "wide" | "full";

/** What the page is made of, so the grey stands where the content will. */
export type PageShape =
    "list" | "detail" | "form" | "editor" | "dashboard" | "settings" | "home";

export interface PageLoadingProps {
    shape: PageShape;
    /**
     * The width of the page this stands in for. Never a guess: a loader
     * narrower or wider than its page makes the content jump sideways when
     * it lands, which is worse than no loader.
     */
    width: PageWidth;
    /**
     * The page's real title, when the route knows it ("Orders"). A record's
     * page doesn't until it has read the record, and leaves this out: a bar
     * stands in the title's place.
     */
    title?: ReactNode;
    /** The page's real breadcrumb, as far as the route knows it. */
    breadcrumb?: ReactNode[];
    description?: ReactNode;
    /**
     * The page's real tabs, when the route knows them: the tab component
     * itself, or just the labels (counts aren't known yet, and an unknown
     * count is left out, never shown as 0). Inert while loading.
     */
    tabs?: ReactNode | readonly string[];
    /** What a screen reader is told: "Loading orders". */
    label?: string;
    /** How many rows, panels or fields to draw. */
    rows?: number;
    /**
     * No header and no container: for a route whose layout already drew
     * both (a tab of a site, a tab of Settings).
     */
    bare?: boolean;
    /** The body's own measure, when the page caps it (Settings' rows). */
    bodyClassName?: string;
}

/**
 * The one loading shell.
 *
 * It sits in the same `PageContainer`, at the same width and left edge, as
 * the page it stands in for; it draws that page's REAL header (breadcrumb,
 * title, tabs) and greys only the body, in the shape the body will have. So
 * nothing moves when the page lands except the grey turning into rows.
 *
 * One drawing (`Skeleton`'s sweep), and one way of saying it: a single
 * `role="status"` region, busy, with one sentence for a screen reader and
 * the grey itself hidden from it.
 */
export function PageLoading({
    shape,
    width,
    title,
    breadcrumb,
    description,
    tabs,
    label = "Loading",
    rows,
    bare = false,
    bodyClassName,
}: PageLoadingProps) {
    const body = (
        <div
            role="status"
            aria-busy="true"
            data-slot="page-loading"
            data-shape={shape}
            className={bodyClassName}
        >
            <span className="sr-only">{label}</span>
            <div aria-hidden>{BODY[shape](rows)}</div>
        </div>
    );
    if (bare) return body;
    return (
        <PageContainer width={width}>
            <PageHeader
                holdsData={false}
                breadcrumb={breadcrumb}
                title={title ?? <TitleBar label={label} />}
                description={description}
            />
            {tabs ? (
                // The real strip, so it doesn't arrive after the title; it
                // can't be pressed until the page it switches is there.
                <div inert data-slot="page-loading-tabs">
                    {isLabels(tabs) ? (
                        <div className="flex flex-wrap gap-0.5 border-b border-border">
                            {tabs.map((label) => (
                                <span
                                    key={label}
                                    className="px-[13px] py-[9px] text-[13.5px] font-medium text-muted-foreground"
                                >
                                    {label}
                                </span>
                            ))}
                        </div>
                    ) : (
                        tabs
                    )}
                </div>
            ) : null}
            {body}
        </PageContainer>
    );
}

function isLabels(
    tabs: ReactNode | readonly string[],
): tabs is readonly string[] {
    return Array.isArray(tabs) && tabs.every((t) => typeof t === "string");
}

/**
 * The two arrival screens (`/join/:token`, `/invitations/:token`) while
 * they answer: a centred card on an empty page, as they are, not a screen
 * of the workspace. Same drawing and the same words to a screen reader as
 * every other loader.
 */
export function ArrivalLoading({ label = "Loading" }: { label?: string }) {
    return (
        <main className="mx-auto flex min-h-[60vh] max-w-lg items-center p-8">
            <div
                role="status"
                aria-busy="true"
                data-slot="page-loading"
                data-shape="arrival"
                className="w-full"
            >
                <span className="sr-only">{label}</span>
                <div aria-hidden className={cn(CARD, "space-y-3 p-6")}>
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/5" />
                    <Skeleton className="mt-2 h-[38px] w-36" />
                </div>
            </div>
        </main>
    );
}

/** A record's name, not read yet: a bar the height of the title. */
function TitleBar({ label }: { label: string }) {
    return (
        <>
            <span className="sr-only">{label}</span>
            <Skeleton
                aria-hidden
                className="inline-block h-[30px] w-56 max-w-full align-bottom"
            />
        </>
    );
}

const CARD = "overflow-hidden rounded-xl border border-border bg-card";

/** A table: its search, its header strip, its rows. */
function ListBody(rows = 6) {
    return (
        <div className="space-y-[14px]">
            <Skeleton className="h-[38px] w-full max-w-[320px]" />
            <div className={CARD}>
                <div className="h-[38px] border-b border-border bg-muted/60" />
                {Array.from({ length: rows }, (_, i) => (
                    <div
                        key={i}
                        className="flex items-center gap-4 border-b border-border/70 px-4 py-3.5 last:border-b-0"
                    >
                        <Skeleton className="h-3 w-[28%]" />
                        <Skeleton className="hidden h-3 w-[16%] sm:block" />
                        <Skeleton className="hidden h-3 w-[12%] sm:block" />
                        <Skeleton className="ml-auto h-3 w-16" />
                    </div>
                ))}
            </div>
        </div>
    );
}

/** A record: stacked panels, and its side column from the desk up. */
function DetailBody(panels = 3) {
    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
                {Array.from({ length: panels }, (_, i) => (
                    <Panel key={i} />
                ))}
            </div>
            <div className="space-y-4">
                <Panel />
            </div>
        </div>
    );
}

function Panel() {
    return (
        <div className={cn(CARD, "space-y-3 p-4")}>
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/5" />
        </div>
    );
}

/** A form: label then field, and the button at its foot. */
function FormBody(fields = 4) {
    return (
        <div className="space-y-5">
            {Array.from({ length: fields }, (_, i) => (
                <div key={i} className="space-y-2">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-10 w-full" />
                </div>
            ))}
            <Skeleton className="h-[38px] w-36" />
        </div>
    );
}

/** An editor: its sections down the page, its summary beside them. */
function EditorBody(sections = 3) {
    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
                {Array.from({ length: sections }, (_, i) => (
                    <div key={i} className={cn(CARD, "space-y-4 p-5")}>
                        <Skeleton className="h-4 w-40" />
                        <div className="space-y-2">
                            <Skeleton className="h-3.5 w-24" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-3.5 w-32" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    </div>
                ))}
            </div>
            <div className={cn(CARD, "hidden h-64 lg:block")} />
        </div>
    );
}

/** A dashboard: its figures, then what is ranked under them. */
function DashboardBody(rows = 3) {
    return (
        <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className={cn(CARD, "space-y-3 p-4")}>
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-6 w-20" />
                    </div>
                ))}
            </div>
            <div className="space-y-2.5">
                {Array.from({ length: rows }, (_, i) => (
                    <Skeleton key={i} className="h-[58px] w-full rounded-xl" />
                ))}
            </div>
        </div>
    );
}

/**
 * Home A (DEC-171, `HALoadingD`): the tiles, then Needs you's groups with
 * Today beside them from a wide desk. Below 640px it stands for the
 * phone's Home until U17 draws that shape.
 */
function HomeBody(groups = 5) {
    const group = (i: number) => (
        <div
            key={i}
            className="grid gap-2 border-b border-border/70 p-4 last:border-b-0"
        >
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
        </div>
    );
    return (
        <div className="grid gap-[22px]">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {Array.from({ length: 4 }, (_, i) => (
                    <div
                        key={i}
                        className={cn(
                            CARD,
                            "grid min-h-[104px] content-center gap-2.5 px-4 py-3.5",
                        )}
                    >
                        <Skeleton className="h-3 w-[110px] max-w-full" />
                        <Skeleton className="h-6 w-[70px]" />
                        <Skeleton className="h-[11px] w-[150px] max-w-full" />
                    </div>
                ))}
            </div>
            <div className="grid items-start gap-[22px] min-[1100px]:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
                <div className="grid gap-2.5">
                    <Skeleton className="h-[18px] w-[140px]" />
                    <div className={CARD}>
                        {Array.from({ length: groups }, (_, i) => group(i))}
                    </div>
                </div>
                <div className="grid gap-2.5">
                    <Skeleton className="h-[18px] w-[140px]" />
                    <div className={CARD}>
                        {Array.from({ length: 4 }, (_, i) => group(i))}
                    </div>
                </div>
            </div>
        </div>
    );
}

/** A Settings section: rows of a label, what is saved, and Edit. */
function SettingsBody(rows = 5) {
    return (
        <div className={CARD}>
            {Array.from({ length: rows }, (_, i) => (
                <div
                    key={i}
                    className="flex items-center gap-4 border-b border-border/70 px-[18px] py-3.5 last:border-b-0"
                >
                    <Skeleton className="h-3 w-28 shrink-0" />
                    <Skeleton className="h-3 w-[40%]" />
                    <Skeleton className="ml-auto h-3 w-10" />
                </div>
            ))}
        </div>
    );
}

const BODY: Record<PageShape, (rows?: number) => ReactNode> = {
    list: ListBody,
    detail: DetailBody,
    form: FormBody,
    editor: EditorBody,
    dashboard: DashboardBody,
    settings: SettingsBody,
    home: HomeBody,
};
