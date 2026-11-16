import { formatNumber } from "@/lib/format/money";
import type { ShareItemKind } from "@/lib/share-item/share";

import type { PickFilter } from "./pick";

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
    ownDescription: "Type a line. Saroh draws it in your website's look.",
    whatToPost: "1. What to post",
    whatToPostPhone: "What to post",
    own: "Your own post",
    ownWhat:
        "Say something in a line: open late, closed for Diwali, we're hiring. Add a photo if you like.",
    ownExamples: "Closed for a day, new timings, we're hiring.",
    usePhoto: "Use your photo",
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
    // Boards BPick*, BPost*, BOwn*, BDone*, BSocial* (16 Nov).
    yourPosts: "Your posts",
    pickDescription:
        "Pick what to post. Saroh makes it in your website's look, ready to share.",
    readyDescription: "Your post is ready. Share it, or try another look.",
    ownShort: "A line, or your photo",
    ownThumb: "Your line",
    writeHeadline: "Write a headline",
    orSell: "Or something you sell",
    searchShort: "Search",
    showThem: "Show them",
    hideThem: "Hide them",
    edit: "Edit",
    captionRowLine: "Edit, or try another start",
    lookRowLine: "Post, Square or Story, and colours",
    makeAnother: "Make another post",
    anotherPost: "Another post",
    whatToSay: "What do you want to say?",
    headlinePlaceholder: "Open late on Saturday",
    headlineShort: "Short reads best on a phone.",
    addPhoto: "Add your photo",
    changePhoto: "Change photo",
    removePhoto: "Remove",
    linkTo: "Link to",
    captionAndLink: "Caption and link",
    noCaptionYet: "No caption yet. The link goes on its own.",
    drawsAsYouType: "Draws as you type.",
    draftSaved: "Draft saved",
    savesAsYouGo: "Saves as you type",
    deleteDraft: "Delete this draft",
    deleteTitle: "Delete this post?",
    deleteWhat:
        "It goes from Your posts. Anything already shared stays where it was posted.",
    deleteConfirm: "Delete post",
    keepIt: "Keep it",
    socialDescription:
        "Posts in your website's look, ready for Instagram, WhatsApp and Facebook.",
    newPost: "New post",
    worthToday: "Worth posting today",
    worthFrom: "From your shop, your offers and your blog",
    makeThis: "Make this post",
    notToday: "Not today",
    socialSeeMore:
        "Post straight to Instagram and see what each post brings, with Saroh Social.",
    ownSaved: (when: string) => `Your own post · saved ${when}`,
    deleted: "Post deleted.",
    firstReady: "Your first post is ready",
    firstWhy:
        "Saroh has already drawn these from your business, in your website's look. Pick one and share it in a minute: free, on any plan.",
    firstWhyPhone:
        "Drawn from your business, in your website's look. Free on any plan.",
    ownLine: "A line in your colours",
    useThis: "Use this post",
    pickElse: "Pick something else",
    pickElseDesk: "Or pick something else you sell",
    yourPostsCount: (n: number) => `Your posts (${formatNumber(n)})`,
    liveWhere: (kind: ShareItemKind) =>
        kind === "product" || kind === "offer"
            ? "live on your shop"
            : kind === "post"
              ? "live on your blog"
              : kind === "own"
                ? "on your website"
                : "live on your booking page",
} as const;

/** The pick step's chips, short enough for a row (BPick*). */
export const PICK_CHIP_NAMES: Record<PickFilter, string> = {
    all: "All",
    product: "Products",
    service: "Services",
    post: "Blog posts",
    offer: "Offers",
    book: "Booking page",
};

/** "2 drafts aren't shown: publish them first." */
export const draftsHidden = (n: number, shown: boolean) =>
    shown
        ? `Each one shows the post it makes. ${n === 1 ? "1 draft is" : `${formatNumber(n)} drafts are`} greyed: publish ${n === 1 ? "it" : "them"} first.`
        : `Each one shows the post it makes. ${n === 1 ? "1 draft isn't" : `${formatNumber(n)} drafts aren't`} shown: publish ${n === 1 ? "it" : "them"} first.`;

/** "28 / 90", "126 / 2,200". */
export const counted = (n: number, max: number) =>
    `${formatNumber(n)} / ${formatNumber(max)}`;
