# Legacy (Unmounted) Routes

This folder contains route modules that are intentionally **not mounted** by the application.

Why this exists:
- These routes are kept only for historical reference during migrations.
- Active routing is defined in the currently mounted route modules (see `src/app.ts`).

Do not import or mount these routes unless you are intentionally restoring legacy behavior and have verified API contracts end-to-end.
