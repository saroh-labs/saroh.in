/**
 * The QR code maker's words (QR codes plan U9; design "Saroh QR Codes",
 * screen 02 "Free QR tool"). Every claim here has a row in
 * `docs/architecture/MARKETING_CLAIMS.md` §6b, and says what the page and
 * the API do (`components/v2/tools/qr-code-maker.tsx`,
 * `apps/api.saroh.in/src/modules/tools`).
 *
 * Where the words leave the design, and why:
 *
 * - **The email gate.** The design says "Where should we send it?" and
 *   "One email with your files." No files are emailed: an email a stranger
 *   can trigger carries only Saroh's words (DEV_LEARNINGS, "a public tool
 *   that emails stranger-supplied text is a relay"), and the code never
 *   reaches Saroh at all. The email unlocks the downloads here, and one
 *   email goes with a link back to this page.
 * - **The closing band.** The design says each code in Saroh "counts its
 *   scans and bookings, and can point somewhere new without reprinting",
 *   and "Early access opens 17 Oct." QR codes inside Saroh aren't released
 *   (ledger CN2), so the band says what Saroh does today (ledger H3), and
 *   its button is the site's start button, which knows the launch mode.
 * - **The link starts empty.** The design opens on "glowstudio.in/book", a
 *   made-up business. An empty field draws a sample code for this page, and
 *   says so, rather than a code for an address that may be someone's.
 */
export const qrCodeMaker = {
    path: "/tools/qr-code-maker",
    title: "QR code maker",
    sub: "Your link, your logo, your colour. Free.",
    metaTitle: "QR code maker: your link, your logo, your colour · Saroh",
    socialTitle: "A QR code with your logo, in your colour.",
    metaDescription:
        "Free QR code maker. Type your link, add your logo and pick a colour, then download the code as a PNG or SVG. It's made in your browser.",
    /** What the page is, for search engines' structured data. */
    definition:
        "A free QR code maker: type a link, add your logo, pick a colour and a label, and download the code as a PNG or an SVG. The code is made in your browser.",

    link: {
        label: "Link",
        field: "Web address",
        placeholder: "yourbusiness.in/book",
    },
    logo: {
        label: "Logo",
        add: "Add your logo",
        change: "Change logo",
        note: "Square works best. It covers about a fifth of the code, so it still scans.",
        placeholder: "logo",
        notPicture: "That file isn't a picture. Choose a PNG, JPG or SVG.",
        tooBig: "That picture is over 2 MB. Choose a smaller one.",
        unreadable: "We couldn't read that file. Try another picture.",
    },
    colour: {
        label: "Colour",
        tooLight: "Too light to scan reliably. Pick a darker colour.",
    },
    label: {
        label: "Label (optional)",
        placeholder: "Scan to book",
    },

    preview: {
        /** What a screen reader hears for the code. */
        alt: (link: string) => `QR code for ${link}`,
        sampleAlt: "A sample QR code that opens this page",
        sample: "A sample that opens this page. Type your link to make yours.",
        tooLong: "That link is too long for a QR code. Use a shorter one.",
    },

    gate: {
        title: "Get your QR code",
        emailField: "Email",
        emailPlaceholder: "you@business.in",
        submit: "Get my QR",
        submitting: "One moment…",
        note: "We'll email you a link back to this tool. No newsletter unless you ask. Your link and logo stay in your browser.",
        privacy: "Privacy",
        badEmail: "That email looks incomplete. Check it and try again.",
        rateLimited:
            "That's a lot of tries in a row. Wait a few minutes and try again. Your code is still here.",
        failed: "We couldn't unlock the downloads just now. Try again in a minute. Your code is still here.",
    },

    downloads: {
        png: "Download PNG",
        svg: "SVG",
        svgName: "Download SVG",
        fileName: "my-qr-code",
        needLink: "Type your link to download your code.",
        needColour: "Pick a darker colour to download your code.",
        pngFailed: "We couldn't make the PNG in this browser. Try the SVG.",
        emailed: {
            sent: "We've emailed you a link back to this tool.",
            limited:
                "We've emailed this address a few times today, so there's no email this time.",
            "not-sent":
                "We couldn't send the email just now. Your downloads are ready here.",
        },
    },

    band: {
        title: "Give your code a page to open",
        body: "Saroh puts your site, bookings, orders and GST invoices in one place. Point your code at your Saroh page and people can book from it.",
    },
} as const;
