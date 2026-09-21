import type { LucideIcon } from "lucide-react";
import {
    AlignLeft,
    CalendarClock,
    CircleHelp,
    Images,
    LayoutList,
    MailQuestion,
    MapPin,
    MousePointerClick,
    PanelTop,
    Quote,
    Sparkles,
} from "lucide-react";

import type { SectionType } from "@/lib/sites/service";

/**
 * One icon per block, for the block list and the inspector (#340).
 *
 * Typed like `SECTION_LABELS`, so a block type added without an icon is a
 * compile error rather than a blank space in the list.
 */
export const SECTION_ICONS: Record<SectionType, LucideIcon> = {
    hero: PanelTop,
    richText: AlignLeft,
    cta: MousePointerClick,
    gallery: Images,
    enquiry: MailQuestion,
    booking: CalendarClock,
    features: Sparkles,
    faq: CircleHelp,
    testimonials: Quote,
    contact: MapPin,
    servicesList: LayoutList,
};
