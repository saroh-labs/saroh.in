/**
 * What a catalogue group is called on screen. The groups themselves come
 * from the API's catalogue (`GET roles/catalogue`); these are only their
 * names, shared by the role editor and a person's extra permissions (F17) so
 * both list the same powers under the same headings.
 */
export const CAPABILITY_GROUP_LABEL: Readonly<Record<string, string>> = {
    business: "Business",
    team: "Team",
    sell: "Sell",
    website: "Website",
    contacts: "Customers and contacts",
    schedule: "Schedule",
    money: "Money",
    messaging: "Messaging",
    insights: "Insights",
};
