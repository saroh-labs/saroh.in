# Forms

> **Read when:** building or changing a form in any app.
> Adapted from claude-patterns `frontend/03-forms.md`. Field and label rules
> also appear in `docs/design-system/07_STYLE_GUIDE.md` §4 and
> `13_ACCESSIBILITY_GUIDE.md` §5.

## The stack in `app.saroh.in`

**Current** — React Hook Form, `zodResolver`, and the `@saroh/ui/form`
primitives (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormMessage`), made
the standard in #109. Nine forms in `app.saroh.in` use it, plus the `saroh.in`
waitlist; `components/stores/product-form.tsx` is the reference for a single
form.

**Current** — **A long editor saves by section** (DEC-022):
`components/commerce/product-editor-v2/` is the reference. Each section keeps
its own react-hook-form (or a draft for lists like photos and variants) and
reports two things through `useSection` — whether it is dirty, and the first
thing it must fix. The shell turns those into the section's chip, border and
save bar, the header's hint, the jump dots, Save all and the leave dialog.
Section patches send only their own fields; the API judges the whole product
after the patch.

**Current** — **A short editor saves once** (E2): the Service Editor
(`components/services/service-editor/`) has one Save in its sticky header,
as its design draws. The page holds one draft; its rules, the problems
strip, what Save sends and the leave dialog's section names are pure
functions in `lib/services/service-editor.ts`, tested with vitest. It
replaced the service dialog and the two react-hook-form service forms.

**Current** — **A published record's editor autosaves on the shared shell**
(D6, DEC-043): `components/editor-shell/editor-shell.tsx`, for the Plan
Editor (D7) and the Pack Editor (E18), and Courses later. The record type
passes an adapter of Server Actions (`EditorAdapter` in
`lib/editor-shell/types.ts`: create, save draft, publish, discard, delete,
load), its words and rules, and draws its sections from the values the
shell hands it. The shell owns autosave (about 800 ms, flushed on blur,
before Publish and on leaving), the banner and actions per status (Draft ·
Live · Live with unpublished changes), "Not saved" with Try again, and the
409 conflict state with Reload. Its rules are pure in
`lib/editor-shell/state.ts` and `autosave.ts`; a record service reads a
refused write with `editorFailure` (`lib/editor-shell/result.ts`) so a stale
revision becomes the conflict state. Don't give a record type its own save
loop. The Pack Editor (`components/class-packs/pack-editor/`, E18) and the
Plan Editor (`components/subscriptions/plan-editor/`, D7) are the reference
consumers. The Pack Editor's rules are pure in `lib/class-packs/pack-editor.ts`:
`problemsOf` receives the last record (for a rule against what is live, such
as a sold pack's kind), `viewable` says when "View" shows, and what an
autosave sends leaves out a field the API would refuse ("4500.", 5 days) so
the rest still saves while that field's problem keeps Publish off. The Plan
Editor's rules (problems, the save blocker, "When you publish" lines) are pure
in `lib/subscriptions/plan-editor.ts`, and `plan-editor-adapter.ts` turns the
typed form into the API's values and back.

**Current** — **A settings row is read first and edited in a side sheet**
(owner, 10 Oct): a location's tabs (`components/stores/`) and every tab of
Settings › Business (`components/organizations/`) draw `Row`s from
`components/sites/settings-rows.tsx` — label, a sentence of what is saved,
Edit — and each Edit opens its own `@saroh/ui/sheet` with one Save.
`SettingsSheetFrame` in `components/shared/settings-sheet-frame.tsx` is the
frame to use (`PlaceSheetFrame` names it by a location's row): the fields
scroll, Save then Cancel sit at the foot, nothing saves until Save, a
refusal keeps the sheet open with what was typed, Cancel, Escape and the
close button drop the draft, it can't be dismissed while saving, each
opening is a fresh draft (a `key` per opening) and the keyboard returns to
the row's Edit. A link opens one with `?edit=` (`lib/stores/place-rows.ts`).
Product settings' lists (`components/commerce/product-settings/`) are the
same rule for a list you manage: `NameDialog` for a one-field add or rename,
`SettingsSheet` for anything with more (an option's name and values, a
field, a merge), each opened by its own trigger so the keyboard returns to
it, and `ConfirmDialog` (`returnFocusTo`) before a delete. No row turns
into a form, and the task finishes inside what opened.

A record's page is the same rule: Order Detail
(`components/commerce/order-detail/`) shows status, items, payments and
the timeline, and each change (hand to courier, tracking, edit, refund,
how it's fulfilled, cancel) opens its own sheet, one at a time.
`OrderSheet` in `order-sheet.tsx` is that frame, built on
`components/shared/action-sheet.tsx`: the fields scroll
(`OrderSheetBody`) and what the change does to the money stays at the
foot with the button that makes it (`OrderSheetFoot`), wider
(`sm:max-w-lg`) where a list of lines needs it. A sheet opened from more
than one button has no single trigger, so `useOrderPanel` remembers the
button pressed and gives the keyboard back to it. A change that is held
ten seconds (a refund, a cancel) closes its sheet into the hold card on
the page, where its Undo is.

The same goes for adding to a list: the list, then one button that opens
the sheet, never fields left open under the rows. Where the screen has its
own Save bar (Availability's Time off, `add-time-off-sheet.tsx`), the
sheet's button adds to the page's draft and the sheet says so. One or two
short choices inside a dense grid (a time range in a week's row,
`weekly-hours.tsx`) open in a popover over the row, so no other row moves.
Two addresses that show the same records are one screen with a segmented
switch on both (`bookings-view-switch.tsx`, `leads-view-switch.tsx`), not a
loose button to the other. And a small job is finished where it started:
a button that only needs a name or a choice opens its dialog there
(the calendar's "Add someone") instead of sending the merchant to another
page.

Website › Settings follows it (`components/sites/settings/`): its frame is
`SettingsSheetFrame` in `settings-sheet.tsx`, a copy of The place's with
the same classes until the two are lifted into one, and its links are
`settingsEditHref` in `lib/sites/settings-edit.ts`. Whatever the row needs
is done inside its sheet or dialog (the share image is uploaded there, Add
domain shows its DNS records there); an Edit never sends the merchant to
another page to finish.

the row's Edit. A link opens one with `?edit=` (`lib/stores/place-rows.ts`,
`lib/organizations/business-rows.ts`; build a Business link with
`businessEditHref`). With the draft in a sheet, the page needs no
leave-with-unsaved-changes guard. **What a row needs is done in its sheet**
(owner, 10 Oct): an Edit never sends someone to another page, so an upload
sits in the sheet itself (`components/shared/logo-upload.tsx`, a logo field
with no page state) and a field another row owns joins the sheet that needs
it (turning GST on asks for the registered address there). Where a preview
sits beside the rows it shows what is saved; the sheet draws the same
preview under its fields, from the draft.

## Rules

- **Current** — **Schema first.** A `z.object` at the top defines validation and
  the type (`z.infer`), with `defaultValues` set (`product-form.tsx`).
- **Current** — **Submit through a Server Action and read its result.**

    ```ts
    const res = await createProduct(storeId, input);
    if (!res.ok) {
        if (
            res.field === "name" ||
            res.field === "slug" ||
            res.field === "price"
        ) {
            form.setError(res.field, { message: res.error });
        } else {
            showError(res.error);
        }
        return;
    }
    showSuccess("Product created");
    router.push(`/stores/${storeId}/products/${res.data.id}`);
    ```

    A server error that names a field goes on that field; anything else is a
    toast of the API's guarded message. Never hold a server error in `useState`.

- **Adopted** (2026-10-05) — **The schema checks what the API's DTO
  checks.** A class-validator refusal reaches the app as a bare
  "Validation failed" with no field, so it can only be a toast. An empty or
  malformed value is caught by zod and shown under its field first, e.g.
  `lib/discounts/value.ts` in the discount form.
- **Current** — **Money stays a string** from input to API
  (`price: values.price.trim()`). The API computes in cents.
- **Current** — **Disable submit while the action runs.** All nine forms and
  the waitlist do.
- **Adopted** — **Every field has a visible label; a placeholder is never the
  label** (13 §5). Not measured.
- **Current** — **shadcn controls, never native pickers.** A list is a
  `Select` — `components/shared/option-select.tsx` wraps it for flat option
  lists and maps a `""` "None" value, which Radix reserves. A time of day is
  `@saroh/ui/time-select` (fixed steps, value stays "HH:MM"); a date is
  `@saroh/ui/date-picker` (Popover + Calendar). No `<select>`,
  `type="date"`, `type="time"` or `type="datetime-local"` remains in
  `app.saroh.in`; with react-hook-form, drive them through `Controller` or
  `FormField`, not `register`.
- **Adopted** — **Form primitives, not raw inputs,** in application forms.
  Raw `<input>` and `<textarea>` elements remain in some inline managers.
- **Adopted** — **Controls meet the touch target on a phone.** `Button` does
  (`coarse:`, `frontend-design-system.md`); inputs were not re-checked.

## Elsewhere — all **Current**

- `accounts.saroh.in` forms are hand-rolled client components against
  `authClient`, and that app does not depend on React Hook Form. Keep a new
  accounts form consistent with its neighbours unless you are migrating them
  all.
- `packages/site-blocks` enquiry and booking forms run on merchant sites and
  manage their own state; the package does not depend on `@saroh/ui`.
- Eight `app.saroh.in` components with a `<form>` still hold fields in `useState`
  — inline managers such as `categories-manager` and `pages-panel`. Migrate
  one when you are already changing it (`members-manager` went when a
  location's people became a tab: its invite is `invite-person-sheet.tsx`,
  on the stack above).
