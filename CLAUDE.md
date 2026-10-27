# ckdry

Tauri v2 app (Rust runtime in `desktop/src-tauri`, Vite + React 19 frontend in
`desktop/src`) for practising the CKA/CKAD/CKS exams on local kind clusters.
Architecture: `docs/ARCHITECTURE.md`.

## UI

The frontend follows the nextflix stack and its kit conventions.

- **The kit first.** `packages/ckdry-ui` (`@ckdry/ui`, forked from
  `@nextflix/ui`: Radix + `cva` + `cn()`, imported as
  `@ckdry/ui/components/<name>`) owns every reusable control and surface:
  - `Button` for text actions, `IconButton` for icon-only ones (its label
    is the tooltip).
  - `SegmentedControl` for 2–5 options, `Stepper` for − value +, `Select`
    for longer lists.
  - `Popover` with the `menu` classes for menus, `AlertDialog` to confirm.
  - `Tooltip`, never a native `title=`.
  - `Card` for grouped surfaces, `Alert` for inline messages, `CodeBlock`
    for commands, manifests and logs.
  - `Separator`, `Badge`, `Chip`, `Spinner`.

  Hand-rolled `<button>`, `<select>` or bordered `div`s are a missing kit
  component: add it to the kit instead.
- **The design system, live:** `desktop/kit.html` (`cd desktop && pnpm exec
  vite`, then `/kit.html`) shows every kit component and the app's patterns in
  both themes. A new component or variant goes there too.
- **Tokens, not palette colours.** Use the theme's tokens: `background`,
  `card`, `muted`, `border`, `highlight`, `success`, `warning`,
  `destructive`, and so on. Exam-specific accents are app tokens in
  `desktop/src/index.css` (`exam-value`, `exam-concept`). No hex values or
  `red-500` in classNames.
- **A repeated class string becomes a component or a `cva` variant.**
  `style={{…}}` is only for runtime values.
- **Dark by default.** `data-theme="dark"` on `<html>`; `dark:` follows
  `data-theme`.
- **Accessible names.** Icon-only controls have an `aria-label`; labels that
  hide in narrow layouts use `sr-only`, not `hidden`.

## Checks

```bash
cd desktop && pnpm typecheck
pnpm exec biome check <files you touched> --write
cd src-tauri && cargo test            # unit tests; e2e: cargo test -- --ignored
```

Desktop image files change the image tag: regenerate the manifest with
`cargo run -- images > resources/images.json`.
