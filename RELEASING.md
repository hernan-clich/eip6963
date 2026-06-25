# Releasing

Releases publish automatically via GitHub Actions (OIDC trusted publishing,
with provenance). You never run `npm publish` or touch a token.

## The whole flow

```sh
# 1. commit your changes (normal git)
git add -A && git commit -m "what changed"

# 2. cut the release — pick the bump:
npm run release          # patch  (0.1.1 → 0.1.2)
npm run release:minor    # minor  (0.1.1 → 0.2.0)
npm run release:major    # major  (0.1.1 → 1.0.0)

# 3. approve it
#    GitHub → Actions → the paused "Publish Package" run
#    → Review deployments → Approve and deploy
```

That's it. The release script bumps the version, creates the `vX.Y.Z` commit +
tag, and pushes both (the tag is what triggers publishing).

## What the script does for you

`npm run release` runs:

1. `preversion` — `typecheck` + `biome check` + `build`. If anything fails, the
   release **aborts before tagging**, so a broken build never reaches CI.
2. `npm version <patch|minor|major>` — bumps `package.json` + `package-lock.json`,
   commits, and creates the git tag. (Requires a clean working tree — that's why
   you commit your changes first.)
3. `git push --follow-tags` — pushes the branch and the tag together.

## Notes

- The publish pauses on the `release` environment for your approval — nothing
  ships without a click.
- Provenance is attached automatically (public repo + OIDC). No flags.
- If `npm version` complains about a dirty tree, commit (or stash) first.
