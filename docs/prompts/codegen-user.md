# REACTIVE — Codegen user message (template)

Fill in the bracketed sections when invoking the model.

---

**App Spec (JSON)**

```json
[ PASTE_APP_SPEC_JSON_HERE ]
```

**Task**

Using the REACTIVE Expo template in `template/expo-starter`, implement the App Spec above.

1. Align tab routes and screen titles with `navigation` and `screens`.
2. Apply `design.primary_color` and `design.color_mode` via the existing theme mechanism (`constants/Colors.ts` and navigation theme if needed).
3. For each `screens[]` entry, create or update a route component under `app/` with blocks implemented as sensible placeholders (lists, forms, settings, etc.) matching `blocks`.
4. Wire `journeys` into copy or empty states where helpful (no extra features).
5. Update `GENERATION_NOTES.md` with any assumptions.

**Do not** implement anything in `non_goals`.

---

## Optional: follow-up patch (post–v1)

**Spec diff or instruction:** [ SHORT CHANGE ]

Apply a minimal diff to the existing generated project. Do not rewrite unrelated files.
