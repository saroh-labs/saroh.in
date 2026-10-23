---
type: feat
status: active
date: 2026-10-23
decision: DEC-185
---

# The site editor on a phone without bottom tabs, and Publish as a sheet

## Problem

On a phone the site editor stacks a top bar, the page and a bottom tab bar
(Page · Add · Brand · Feedback). The tab bar takes a strip of the screen the
page needs, and every tab opens a sheet that covers most of the page it
changes. Publishing, on phone and desk, leaves the editor for a full-screen
check and then a full-screen "is live" page: a long walk for what is usually
one line and one button.

The owner signed off the boards on 23 Oct 2026: no bottom tabs on a phone,
one floating pill, a toolbar on the tapped block, and Publish as a sheet on
both phone and desk (the side sheet was chosen over a dialog and a popover,
and one surface is kept for every case rather than a popover for short lists).

## The boards (source of truth)

Canvas "Saroh App Designs", page "Website editor Brand tab: audit, current and
improved" (local copies in the owner's design drafts folder, `brand-tab-audit/`):

- `BRPhoneEditor`: the phone editor at rest.
- `BRPhoneEditorBlock`: a block tapped.
- `BRPhoneActions`: what each action opens: Blocks, +, Home ▾ (pages), ⋯,
  Publish, Publish blocked, after publishing, move up, remove.
- `BRPhone`, `BRPhoneType`, `BRPhoneColour`, `BRPhoneSpacing`: the Brand sheet.
- `BRDeskPublish`: Publish on desk as a side sheet, six steps (a few changes,
  many changes, blocked, fixing in place, publishing, live), plus the dialog
  and popover that were compared and not chosen.

Match them exactly; where a board's words differ from the code's, the code's
wording for an existing thing wins and the difference is reported.

## Rules for every unit

- **Keep every capability** (owner, 19 Oct). Nothing the editor does today on a
  phone is removed or merged away: Preview (phone and desk width), Feedback
  with its open-notes count, Share (ask a teammate to review, share a preview
  link, withdraw a review request), Test releases (make one, see the list),
  light/dark preview, page switching and page settings, Add block with its
  groups, block reorder, block remove with Undo, Publish with approval rules
  (In review, Publish without approval, the owner's override).
- Desk changes only where this plan says: Publish becomes the side sheet.
  Every other desk screen stays as it is.
- Reuse the house parts: `Sheet`, `Popover`, `Command`, `Button`, the Undo
  toast (`showUndo`), the editor's `use-undo.ts`. No new dependency.
- Phone targets are at least 44px. Sheets open to half height first and can be
  pulled up; the page stays in view above.
- Plain merchant words. Same words on phone and desk.

## Units

### U1. Publish as a sheet (phone and desk)

Replaces the full-screen check (`components/sites/publish/pre-publish-check.tsx`)
and the went-live page (`went-live.tsx`) with one sheet: from the right on a
desk (about 440px, over the inspector), from the bottom on a phone.

- **Top:** "Going live:" and what changes. One change: one line ("the style
  (look, colours and type)"). Several: one row per area that changed (a page,
  the menu, the style, the footer).
- **Fix first:** blocking flags (`blocking: true` from the API: today no web
  address, and the hero's own helper line still in place) in red, on top, each
  with its fix. Publish is greyed out and the foot says why, in today's words
  ("Choose a web address first").
- **Worth a look · won't stop you:** the advice flags, each with its fix link.
  The line "It won't stop you publishing." shows only when there is no blocker.
- **Fixing in place:** a fix opens inside the sheet where it can (the web
  address field, with its availability check, Save address, Cancel). A fix
  that lives on a page (placeholder text, a missing image, a broken link)
  takes the merchant to that spot and leaves the sheet ready to reopen with
  the same list.
- **Publishing:** the button shows "Publishing…" and the sheet stays.
- **Live:** the same sheet becomes the result: a tick, "{Site} is live",
  "Anyone can open it now.", the address with a copy button, Open site,
  Share link, Done. The top bar's status becomes "Live".
- Approval rules unchanged: In review, "Publish without approval", the
  owner's override (destructive style), the approval line in the list.
- A never-published site says "Publish site"; otherwise "Publish changes".
- Errors from the publish call are said in the sheet's foot, never only a toast.

### U2. The phone editor without bottom tabs

`editor-top-bar.tsx`, `top-bar-actions.tsx`, `rail-bottom-bar.tsx`,
`editor-sheet.tsx`, `use-editor-layout.ts`.

- **Top bar:** ← Website · page picker (Home ▾) · status chip (Draft / Live) ·
  ⋯ · Publish.
- **⋯ opens "More"** as a bottom sheet with groups: Check (Preview, Feedback
  with its open-notes count), Share (Ask a teammate to review, Share a preview
  link, or Withdraw the review request while one is open), Test releases (Make
  a test release, See test releases). The ⋯ button carries a dot while notes
  are open.
- **The bottom tab bar goes.** The page fills the screen.
- **One floating pill** at the bottom centre: Blocks · + · Brand. It hides
  while any sheet is open and while the keyboard is up.

### U3. Blocks, Add and Pages sheets (phone)

- **Blocks:** "Blocks on {Page}": every block in order, with its label and
  first line; Header and Footer marked Fixed. Tap a row: the sheet closes, the
  page scrolls to the block and selects it. Drag the handle to reorder (the
  same move the desk rail makes, with its Undo).
- **+ Add a block:** search, then today's groups (Structure, From your
  business, Every page) with each block's one line. Tap: the block goes under
  the selected block, or at the end, and its settings open.
- **Home ▾ (Pages):** the site's pages with path and state, the current one
  ticked; New page; "{Page}'s settings" (address, search title, hide, delete).

### U4. A tapped block (phone)

- The block gets an outline and a small toolbar beside it: Move up, Move down,
  Remove. Move shows "{Block} moved up/down" with Undo; Remove shows
  "{Block} removed" with Undo (no confirm, as on desk).
- Its settings open in a bottom sheet (today's inspector for that block), with
  close at the top right.

### U5. The Brand sheet (phone)

Builds the phone half of DEC-184, held until now.

- One sheet: header "Brand · Saved · ⋯ · ✕" (close top right; ⋯ holds Reset
  style…, which asks first and offers Undo), and four tabs: Look · Type ·
  Colour · Spacing.
- Look: cards to swipe, tap to use, "Now" on the current one, Preview under
  each; one "come with paid plans" line; Bring in my details and Previous
  versions below.
- Type: each face in itself, tap to use; the refusal line for a paid face.
- Colour: chips for the six parts, each showing its colour; the part's named
  swatches below; a faded swatch says why in words.
- Spacing: the five sliders.
- The in-sheet picker code from DEC-184 (`PickerHost`) is used or removed;
  nothing unwired is left behind.

### U6. Checks, records and boards

- Unit tests for each new piece (the sheet's states from flags, blocked vs
  advice, the pill hiding, the toolbar's Undo).
- Browser specs, phone and desk, for: Publish (few, blocked, live), the ⋯
  sheet, Blocks reorder, Add a block, Pages switch, block toolbar, Brand tabs.
  Update every existing spec that drives the bottom bar or the full-screen
  check.
- `docs/patterns/` gets the rule "choosing is a popover, committing is a
  sheet", where the editor's patterns live.
- If a built screen differs from its board, update the board or report it.

## Order

U1 first (it touches desk and phone and changes the most specs), then U2,
then U3 and U4 together, then U5, then U6's sweep. Each unit is a commit in
the batch; nothing is pushed until the owner says so.
