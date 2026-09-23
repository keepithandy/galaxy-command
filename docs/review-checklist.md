# Review Checklist

Use this before merging a Galaxy Command change.

- Keep planet selection, movement, and conquest state deterministic.
- Verify the galaxy view still reads clearly at desktop and mobile sizes.
- Avoid changing progression or combat values during visual-only patches.
- Make unavailable planets/actions explain why they are unavailable.
- Preserve save/state compatibility when changing identifiers or map data.
- Add a smoke case when changing turn, selection, or persistence logic.

A safe patch should make the galaxy easier to understand without changing the strategic rules unexpectedly.
