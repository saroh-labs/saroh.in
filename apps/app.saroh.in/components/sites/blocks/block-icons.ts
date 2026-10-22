import type { LucideIcon } from "lucide-react";
import {
    AlignLeft,
    Briefcase,
    CalendarClock,
    CalendarDays,
    CircleHelp,
    Clock,
    Clock4,
    Images,
    LayoutGrid,
    LayoutList,
    MailQuestion,
    MapPin,
    MousePointerClick,
    Newspaper,
    PanelTop,
    Quote,
    Repeat,
    Sparkles,
    Ticket,
    UserRound,
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
    visitUs: Clock,
    journal: Newspaper,
    plans: Repeat,
    packs: Ticket,
    productGrid: LayoutGrid,
    projects: Briefcase,
    timetable: CalendarDays,
    hours: Clock4,
    person: UserRound,
};
