import type { SiteChangeKind } from "@/lib/sites/pending";
import type {
    ModulePageKind,
    ReviewState,
    Section,
    SiteCommentView,
    SiteFlags,
    SiteFooter,
    SiteNavigation,
    SitePage,
} from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";

/** What the editor's page (`app/(editor)/sites/[siteId]/page.tsx`) hands it. */
export interface SiteEditorProps {
    siteId: string;
    pageId: string;
    /** Every page on this site, for the Pages tab. */
    pages: SitePage[];
    /** The site's advisory flags, as the server computed them. */
    initialFlags: SiteFlags;
    /** Reviewer notes and the latest verdict (#193). */
    initialComments: SiteCommentView[];
    initialReview: ReviewState;
    /** Never-published sites say "Publish site", not "Publish changes". */
    /**
     * Whether anything has ever been published. The INITIAL value: publishing
     * makes it false without a reload (#288), so the editor keeps this in
     * state rather than reading the prop directly.
     */
    neverPublished: boolean;
    /**
     * Keys of sections whose stored content no longer matches their contract
     * (#275). Shown, not hidden: it is the merchant's work, and a section
     * quietly missing from the list would be deleted by the next save.
     */
    unreadableSections: string[];
    /**
     * How many sections publishing would change, as the server counted it on
     * load (#190). Null before the first publish. Refreshed by every autosave.
     */
    initialPendingChanges: number | null;
    /** Site-level settings publishing would change (#282). Null before the first publish. */
    initialPendingSiteChanges: SiteChangeKind[] | null;
    initialSections: Section[];
    /** Which edit of the draft `initialSections` are (#285). */
    initialRevision: number;
    siteName: string;
    /** The site's menu, by page id; resolved here for the canvas header. */
    navigation: SiteNavigation | null;
    /** The footer, sanitized by the API, for the canvas to draw (#336). */
    footerPreview: SiteFooter | null;
    /**
     * Whether this person holds `site:update` (G6). Without it the header's
     * name and the footer's line show read-only in the inspector.
     */
    canUpdateSite: boolean;
    initialStyle: SiteStyle;
    styleOptions: SiteStyleOptions;
    /** Where this site lives, shown in the bar. Null before a subdomain exists. */
    address?: string | null;
    /**
     * Whether the shop is open for the business (G11–G13, `SITE_SHOP`):
     * only then are blocks that sell, the Product grid (G12), offered.
     */
    shopOpen?: boolean;
    /**
     * The module pages the site can have now (G14): the page menu's "Add a
     * page" offers these, then a blank page. Empty without `site:update`.
     */
    addablePageKinds?: ModulePageKind[];
}
