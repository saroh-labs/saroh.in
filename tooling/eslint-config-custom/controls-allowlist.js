/**
 * What app.saroh.in still draws by hand, by file, and what each one is.
 *
 * `controls.js` forbids a raw `<button>`, `<input>`, `<select>`,
 * `<textarea>` and `<label>` in app code. A file here keeps only the tags
 * it names, and every entry is a different control: a row or card that is
 * one button, a tab, a calendar cell, a file picker, a slider, a rich text
 * toolbar's toggles. These are not `Button` or `Input`.
 *
 * A choice is never one of them. A segmented switch, a set of chips, radio
 * rows, a tick and a switch are the shared pieces (`Segmented`,
 * `ChipGroup`, `RadioCards`, `ChoiceGroup`, `CheckRow`, `SwitchRow`), and a
 * label is `Field` or `Label`: see `docs/patterns/frontend-forms.md`.
 *
 * A new file is added only for a different control. When a file stops
 * drawing a tag, take the tag off its line:
 * `apps/app.saroh.in/lib/controls-allowlist.test.ts` fails on a line that
 * no longer matches the code.
 */
export const RAW_ALLOWED = {
    // button: a row or card that is one button; input: a hidden form value
    "app/choose/page.tsx": ["button", "input"],
    // button: a bar of a chart, pressed to read it
    "components/analytics/readout-bars.tsx": ["button"],
    // button: Came and Didn't come, a finished row's two outcome chips (U11)
    "components/bookings/all-bookings/booking-row.tsx": ["button"],
    // button: the More filters chip at the end of All bookings' views
    "components/bookings/all-bookings/more-filters.tsx": ["button"],
    // button: each item of a row's menu sheet on a phone, a row that is one button
    "components/bookings/all-bookings/row-menu.tsx": ["button"],
    // button: a row that is one button (a rule, opened to change it)
    "components/bookings/availability/booking-rules-card.tsx": ["button"],
    // button: a row that opens its time picker under it
    "components/bookings/availability/clock-select.tsx": ["button"],
    // button: a row that is one button (a shift, a person's day, add a shift)
    "components/bookings/availability/day-editor.tsx": ["button"],
    // button: a row that is one button (a person, opened to change their day)
    "components/bookings/availability/everyone-day.tsx": ["button"],
    // button: a row that is one button (add someone else)
    "components/bookings/availability/first-hours.tsx": ["button"],
    // button: a row that is one button (More's rows)
    "components/bookings/availability/more-list.tsx": ["button"],
    // button: a row or card that is one button
    "components/bookings/availability/time-off-card.tsx": ["button"],
    // button: a chip, a row or card that is one button
    "components/bookings/availability/weekly-hours.tsx": ["button"],
    // button: a card that is one button (whose hours, opened to pick)
    "components/bookings/availability/whose-hours.tsx": ["button"],
    // button: New booking's What next? rows, each a row that is one button
    "components/bookings/new-booking/done-step.tsx": ["button"],
    // button: New booking's chips of what is picked, and its step list's
    // steps, each a row that goes back to its step
    "components/bookings/new-booking/flow-frame.tsx": ["button"],
    // button: the List's free times card that opens, and each free time a row
    "components/bookings/calendar/list/list-free-times.tsx": ["button"],
    // button: each booked row of the List, one button
    "components/bookings/calendar/list/list-view.tsx": ["button"],
    // button: the date title and the person chip of header C, and "…"
    "components/bookings/calendar/header/calendar-header.tsx": ["button"],
    // button: a calendar cell (the week strip and the month), a step
    "components/bookings/calendar/header/date-sheet.tsx": ["button"],
    // button: a row that is one button (a person, picked to see theirs)
    "components/bookings/calendar/header/people-sheet.tsx": ["button"],
    // button: a menu row that is one button (the quick look's More)
    "components/bookings/calendar/quick-look-more.tsx": ["button"],
    // button: a cell covered by its button, a row or card that is one button
    "components/bookings/calendar/day-by-person.tsx": ["button"],
    // button: a booking on the Day calendar, a block that is one button
    "components/bookings/calendar/day-block.tsx": ["button"],
    // button: a booking on the diary, a block that is one button
    "components/bookings/calendar/diary-block.tsx": ["button"],
    // button: free time on the diary, a cell covered by its button
    "components/bookings/calendar/free-gap.tsx": ["button"],
    // button: a day heading, a cell that is one button
    "components/bookings/calendar/week-view.tsx": ["button"],
    // button: free time and a booking on the diary, each one button
    "components/bookings/calendar/week-blocks.tsx": ["button"],
    // button: a row that is one button (a free time, a booking)
    "components/bookings/calendar/week-day-rows.tsx": ["button"],
    // button: a calendar cell (the week strip)
    "components/bookings/calendar/week-phone.tsx": ["button"],
    // button: a calendar cell
    "components/calendar/month-grid.tsx": ["button"],
    // button: the filter chip, a chip, a row that is one button (a person,
    // a layer ticked on or off)
    "components/calendar/what-to-show.tsx": ["button"],
    // button: a row or card that is one button
    "components/calendar/month-strip.tsx": ["button"],
    // button: a calendar cell (a week day's head, which opens the day)
    "components/calendar/week-day-head.tsx": ["button"],
    // button: a calendar cell (the week strip)
    "components/calendar/week-strip.tsx": ["button"],
    // button: a control styled by its screen's own helper
    "components/class-packs/pack-detail/overview.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/order-detail/stepper.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/orders/bulk-bar.tsx": ["button"],
    // button: the ink bar's own buttons, as Orders' bulk bar draws them
    "components/invoices/remind-bar.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/orders/order-row.tsx": ["button"],
    // button: a combobox trigger
    "components/commerce/product-editor-v2/category-picker.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/product-editor-v2/photo-library-panel.tsx": ["button"],
    // button: a control styled by its screen's own helper; input: a file picker
    "components/commerce/product-editor-v2/photos-section.tsx": [
        "button",
        "input",
    ],
    // button: a row or card that is one button
    "components/commerce/product-editor-v2/visibility-section.tsx": ["button"],
    // button: a control styled by its screen's own helper
    "components/commerce/product-page/sold-out-actions.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/product-page/stock-tab.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/product-page/stock-table.tsx": ["button"],
    // button: a control styled by its screen's own helper
    "components/commerce/product-page/tracking-actions.tsx": ["button"],
    // button: a rich text toolbar's toggles
    "components/commerce/product-sections/description-editor.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/product-sections/photos-field.tsx": ["button"],
    // button: a status pill that is a switch (On the shop, Team only)
    "components/commerce/product-sections/shop-switch.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/product-settings/option-sheet.tsx": ["button"],
    // button: a chip that adds a token to the pattern
    "components/commerce/product-settings/sku-tab.tsx": ["button"],
    // button: a chip
    "components/customers/customer-picker.tsx": ["button"],
    // button: a Requests row that is one button, opening its side sheet (DEC-172)
    "components/customers/data-requests/requests-view.tsx": ["button"],
    // button: a row or card that is one button
    "components/customers/detail/merge-search.tsx": ["button"],
    // button: a control styled by its screen's own helper
    "components/customers/detail/overview.tsx": ["button"],
    // button: a row or card that is one button
    "components/home/first-run-jobs.tsx": ["button"],
    // button: Home's + on a phone, the 56px square floating over the tab bar
    // that opens the New sheet (DEC-171); no Button size is that shape
    "components/home/new-sheet.tsx": ["button"],
    // button: the phone Home's Next line, a row that is one button (U17)
    "components/home/phone/phone-next-line.tsx": ["button"],
    // button: each Needs you group's line on a phone, a row that is one
    // button, its Show N more, and the line naming what couldn't be checked
    "components/home/phone/phone-needs-list.tsx": ["button"],
    // button: the phone's setup line, a row that is one button, and See all
    // steps, a link that opens the setup sheet
    "components/home/phone/setup-sheet.tsx": ["button"],
    // button: Insights' period on a phone, the board's 40px white button
    // with the period's name that opens its sheet (DEC-171, IBPeriodP)
    // button: a week's bar of Money's chart, pressed to read and open it (U12)
    "components/insights/money-chart.tsx": ["button"],
    // button: an age of "Who owes me?", a row that is one button (U12)
    "components/insights/owed-by-age.tsx": ["button"],
    "components/insights/period-control.tsx": ["button"],
    // button: the board's website chip on Where customers come from, naming
    // the site shown and opening its picker (DEC-171, U14, IBSiteD)
    "components/insights/site-picker.tsx": ["button"],
    // button: a part of the invoice's paper, pressed to change it (U15)
    "components/invoices/paper-editor/part-popover.tsx": ["button"],
    // button: "Add a line" under the paper's lines, a row that is one button (U15)
    "components/invoices/paper-editor/add-line.tsx": ["button"],
    // button: "Cheques not in the bank", a line that is one pressed filter (DEC-173)
    "components/invoices/cheques-line.tsx": ["button"],
    // button: a row or card that is one button
    "components/invoices/invoice-row.tsx": ["button"],
    // button: a figure of the money strip, a card that is one pressed filter (DEC-173)
    "components/invoices/money-strip.tsx": ["button"],
    // button: a line's remove button, drawn twice (phone and desk) in the table's own grid
    "components/invoices/new-invoice/lines-table.tsx": ["button"],
    // button: a row or card that is one button
    "components/organizations/switcher/organization-switcher.tsx": ["button"],
    // button: a row that opens its role
    "components/organizations/roles/role-list.tsx": ["button"],
    // button: the list's New role row
    "components/organizations/roles/roles-tab.tsx": ["button"],
    // button: a control styled by its screen's own helper
    "components/qr/qr-add-logo.tsx": ["button"],
    // button: a row or card that is one button
    "components/qr/qr-target-picker.tsx": ["button"],
    // button: a row that is one button (a service's own hours, opening under itself)
    "components/services/service-editor/hours-field.tsx": ["button"],
    // button: a row that is one button (More details, a saved service's rows)
    "components/services/service-editor/service-rows.tsx": ["button"],
    // button: a row or card that is one button
    "components/settings/activity-list.tsx": ["button"],
    // button: a control styled by its screen's own helper, an option in a list; input: a field its screen draws itself
    "components/settings/settings-search.tsx": ["button", "input"],
    // button: a row or card that is one button
    "components/shared/shell/app-sidebar.tsx": ["button"],
    // button: the one hand-drawn radio, shared by every choice group
    "components/shared/fields/choice-group.tsx": ["button"],
    // button: a control styled by its screen's own helper
    "components/shared/states/failed-read.tsx": ["button"],
    // button: Other rate, a chip-shaped disclosure (aria-expanded) beside the rates (DEC-176)
    "components/shared/fields/gst-rate-picker.tsx": ["button"],
    // input: a file picker
    "components/shared/fields/logo-upload.tsx": ["input"],
    // button: a tab
    "components/shared/page/section-list.tsx": ["button"],
    // button: a control styled by its screen's own helper
    "components/shared/shell/tab-bar.tsx": ["button"],
    // button: a chip
    "components/shared/shell/user-menu.tsx": ["button"],
    // button: a row or card that is one button
    "components/sites/add-block-panel.tsx": ["button"],
    // button: a row or card that is one button
    "components/sites/add-page-panel.tsx": ["button"],
    // button: a row or card that is one button
    "components/sites/add-section-dialog.tsx": ["button"],
    // button: the site editor's own answer buttons
    "components/sites/choice-field.tsx": ["button"],
    // button: a row or card that is one button
    "components/sites/editor/editor-canvas.tsx": ["button"],
    // button: a choice in a list
    "components/sites/editor/editor-rail.tsx": ["button"],
    // button: a row or card that is one button, a row that opens
    "components/sites/editor/editor-top-bar.tsx": ["button"],
    // button: a tab of the editor's bottom bar
    "components/sites/editor/rail-bottom-bar.tsx": ["button"],
    // button: the preview width toggles, a row or card that is one button
    "components/sites/editor/top-bar-actions.tsx": ["button"],
    // input: a file picker
    "components/sites/media-picker.tsx": ["input"],
    // button: a row or card that is one button, an option in a list
    "components/sites/pages-panel.tsx": ["button"],
    // input: a field its screen draws itself
    "components/sites/post-editor.tsx": ["input"],
    // button: a row or card that is one button
    "components/sites/pre-publish-check.tsx": ["button"],
    // button: a colour swatch in the toolbar; input: a field its screen draws itself
    "components/sites/rich-text-editor.tsx": ["button", "input"],
    // input: a slider
    "components/sites/section-fields/padding.tsx": ["input"],
    // button: a block's name tag on the canvas
    "components/sites/section-preview.tsx": ["button"],
    // input: a slider
    "components/sites/style-panel.tsx": ["input"],
    // input: a file picker
    "components/stores/import/csv-import.tsx": ["input"],
    // input: a native radio inside its card; label: a radio card with a timeline in it
    "components/subscriptions/plans/timing-card.tsx": ["input", "label"],
};
