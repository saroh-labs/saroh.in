import { formatNumber } from "@/lib/format/money";

/**
 * Every word Create post says (boards SGPick*, SGOwn*, SFCLocked*). The
 * Share sheet's own words (cards, sizes, captions, Schedule) are
 * `lib/share-item/words.ts`, shared with it.
 */
export const POST_WORDS = {
    title: "New post",
    ownTitle: "Your own post",
    social: "Social",
    description:
        "Make a post from anything you sell and share it. Scheduling to your channels comes with Saroh Social.",
    ownDescription:
        "A headline or your own photo, drawn in your website's look. Share it now on any plan.",
    whatToPost: "1. What to post",
    whatToPostPhone: "What to post",
    own: "Your own post",
    ownWhat: "Your photo or just a headline, in your website's look.",
    ownExamples: "Closed for a day, new timings, we're hiring.",
    usePhoto: "Use a photo",
    textOnly: "Text only",
    yourPhoto: "Your photo",
    noOwnPosts:
        "You can share, but making your own posts isn't part of your role.",
    orPick: "Or pick from your business",
    search: "Search products, services, blog posts and offers",
    searchPhone: "Search products, posts, offers",
    recentFirst: "Recent first. Only things live on your site can be posted.",
    pick: "Pick",
    picked: "Picked",
    live: "Live",
    draft: "Draft",
    nothing: "Nothing matches that.",
    nothingYet:
        "Nothing live to post yet. Publish a product, a service or a blog post first.",
    itsPosts: "Its posts",
    itsPostsNext: "Next: pick a card, then the caption on the same page.",
    pickOne: "Pick something to post, or make your own.",
    cancel: "Cancel",
    continue: "Continue",
    what: "What",
    change: "Change",
    picture: "Picture",
    card: "Card",
    pickInstead: "Pick from your business instead",
    headline: "Headline",
    headlineHint: "Drawn big on your colours. Short reads best on a phone.",
    caption: "Caption",
    link: "Link",
    aPage: "A page",
    choosePage: "Choose a page",
    linkNote:
        "Only published pages. Tagged so Saroh can count visits from this post.",
    ownCardsWhy:
        "No price or discount, so no Price tag or Offer card. Your photo adds a Photo card.",
    addSomething: "Add a headline or a photo to see your cards.",
    fromPhotos: "From your photos",
    choosePhoto: "Choose a photo",
    saved: "Saved to your posts as you go.",
    saving: "Saving…",
    notSaved: "Couldn't save your post. Your words are still here.",
    howItLooks: "How it looks when you share it",
    howItLooksNote: "Close to how it will look. Each app may crop a little.",
    channels: "Channels",
    channelsWhat:
        "Post straight to Instagram, Facebook and Threads, now or at a time you pick, and see what each post brings.",
    justNow: "Just now",
    linkInBio: "Link in bio",
    notLive: "Your website needs to be live to share posts.",
    publishSite: "Publish your website",
} as const;

/** "28 / 90", "126 / 2,200". */
export const counted = (n: number, max: number) =>
    `${formatNumber(n)} / ${formatNumber(max)}`;
