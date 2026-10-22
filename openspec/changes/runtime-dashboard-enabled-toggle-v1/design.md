## Decisions

- **D1 No optimistic update.** The card keeps showing the list value until Runtime answers; the switch is busy meanwhile. A 200 triggers the same list request the tab already uses, so the card, header counts and selection stay consistent with Runtime.
- **D2 The switch sits beside the select button, not inside it** (a button cannot nest a switch). `role="switch"`, `aria-checked` from the list value, label "Enabled" / "Disabled" in text next to the existing state text.
- **D3 Dialog text is fixed per Runtime reason** (table in the spec). Unknown reasons and non-Runtime failures use one generic message. The dialog has one OK button, closes on Esc, and returns focus to the switch.
- **D4 One request at a time per card.** A busy card ignores further clicks; other cards stay usable.
- **D5 Language** follows the existing UI (English).
- **D6 The list value is the file value.** `enabled` in the list is read from the deployment file on every request, so a hand edit of the file shows up on the next refresh; the tab still does not poll. The switch writes through Runtime, never to the file itself.
- **D7 Error bodies.** Runtime answers a refusal as `{"status": "enabled_change_refused", "reason": ...}`; any other body (not-ready, internal error, rejected body) takes the generic text.
