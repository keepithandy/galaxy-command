# Repository integrity smoke

These checks protect repository structure only; they do not change or validate gameplay, economy, map logic, turns, saves, or content.

Run all checks locally with:

```bash
node .github/smoke/run-integrity.mjs
```

`integrity-manifest.json` defines the runtime and minimum check count. The runner discovers each `.mjs` guard in this directory except itself and fails on the first non-zero exit code.

Add future repository-only guards here so CI picks them up automatically.
