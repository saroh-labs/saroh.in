/**
 * The landing's words (boards LAHomeDesk and LAHomePhone2, DEC-221): what
 * each edition's `content/home.ts` gives the shared landing parts. Words
 * only; every name, number and time comes from the edition's world.
 */
export interface HomeWords {
    /** The hero's lead opens with it: the plain category. */
    eyebrow: string;
    /** The h1, desk and phone: one word under the Saffron mark. */
    title: { before: string; mark: string; after: string };
    titleLabel: string;
    lede: string;
    /** A phone's one line of lead. */
    phoneLede: string;
    how: { label: string; short: string };
    /** Once a page, under the hero's start button. */
    freeNote: string;
    trade: { legend: string; phones: string };
    /** The app's own words on the middle phone. */
    appTabs: readonly string[];
    chapters: {
        label: string;
        items: readonly { href: string; label: string }[];
    };
    site: {
        title: string;
        lede: string;
        short: string;
        builder: string;
        templates: string;
        sites: string;
        example: string;
        live: string;
        /** Each example's line, by the world's business key. */
        captions: Readonly<Record<string, string>>;
    };
    orders: {
        title: string;
        body: string;
        short: string;
        link: string;
        list: string;
        due: string;
        toPack: string;
        status: { pickup: string; paid: string; unpaid: string };
        more: string;
        placesBooked: string;
        aPlace: string;
    };
    money: {
        title: string;
        lede: string;
        link: string;
        label: string;
        /** `{amount}` is the paid order's total. */
        customer: { title: string; line: string };
        account: { title: string; line: string };
        bank: { title: string; line: string };
        saroh: { title: string; line: string };
        wire: string;
    };
    /** The money band's chips. */
    chips: readonly string[];
    day: { title: string; line: string; legend: string; spend: string };
    worksFor: string;
    solutionsMore: string;
    news: NewsWords;
    yours: { line: string; link: string };
    featuresEyebrow: string;
    featuresTitle: string;
    newTag: string;
    plans: {
        title: string;
        lede: string;
        start: string;
        askAi: string;
        compare: string;
    };
    faqTitle: string;
    allQuestions: string;
    askUs: { lead: string; link: string };
    closer: string;
    templates: string;
}

/** "New in Saroh": the four cards' words. */
export interface NewsWords {
    title: string;
    lede: string;
    row: string;
    askAi: {
        title: string;
        plans: string;
        languages: string;
        plain: string;
        rows: string;
        change: string;
        /** The question in the edition's other language, once that claim is on. */
        askHi: string;
        askEn: string;
        next: string;
        sold: string;
        sources: readonly [string, string];
        soldThisWeek: string;
        /** The words around the new price: [before, after]. */
        changeHi: readonly [string, string];
        changeEn: readonly [string, string];
        /** "Change", "from", "to", then what the site does. */
        proposal: readonly [string, string, string, string];
        confirm: string;
        notNow: string;
        undo: string;
        more: string;
        link: string;
    };
    share: {
        title: string;
        body: string;
        free: string;
        social: string;
        scheduled: string;
        noteFree: string;
        noteSocial: string;
        posts: readonly [string, string, string];
        link: string;
    };
    aiApps: {
        title: string;
        body: string;
        connected: string;
        /** [lead, "and the", what to do with them]. */
        ask: readonly [string, string, string];
        answer: string;
        draft: string;
        request: string;
        link: string;
    };
    api: {
        title: string;
        body: string;
        readOnly: string;
        active: string;
        delivered: string;
        link: string;
    };
}
