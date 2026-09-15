# Trend and session contract — local handoff

Base: fe78d20. Branch: codex/trend-session-contract. Saved locally; no push.

## Implemented

- getTrend returns points with saved session id, t, speedKmh and errorKmh.
  Empty results have best:null, avg:null and count:0. Points sort by creation
  timestamp then id. Player/date filtering and all-record aggregation remain.
- getSession(id) reads one storage key through the shared cached reader. Missing
  or deleted records return null; malformed or mismatched records throw. Returned
  sessions include copies of all four points so callers cannot mutate the cache.
- Missing uncertaintyModelVersion is normalized to 1 when reading old records.
  This does not rewrite stored JSON or alter errorKmh. Explicit versions other
  than 1 or 2 are rejected. Version 2 values are preserved as supplied.
- Existing Result callers can omit the version on save and are recorded as 1,
  matching the current timing-only physics. New physics callers must explicitly
  supply version 2 when their calculation changes.
- markerSource and paceCount are preserved and validated. Allowed sources match
  AB's new types: measured, paced-measured-shoe and paced-shoe-size. Pace counts
  must be finite and positive; fractions are accepted because no whole-step rule
  was specified. Missing markerSource remains unknown, including legacy records.
- Measured shoeLengthCm is supported in createPlayer/updatePlayer, retained during
  unrelated profile edits, and validated as finite and positive. null clears it;
  omission preserves it. Both shoe size and measured length are stored; AB's
  calibration code owns which one takes precedence.
- Ownership check now compares against fe78d20, excluding changes AB already
  merged. No app, shared type, UI, physics, native module, font or build edits.

## Outstanding dependency: uncertainty recomputation

AB has landed the types, but computeSpeed still contains the old timing-only
formula and provides no combined uncertainty helper. This branch therefore does
NOT implement version-2 recomputation. It keeps legacy errors identified as
version 1. It must not be described as completing the full uncertainty work.

When AB supplies the canonical helper and version:
1. Integrate it in the shared reader before caching/returning normalized sessions.
2. Recompute only older models; keep stored JSON untouched.
3. Return a matching model version for the recomputed value.
4. Confirm identical uncertainty in direct reads, lists, Trends, comparisons and
   export input, including module restart and cache invalidation.
5. Test that reads do not change stored JSON and version-2 records stay unchanged.

AB must specify a fallback for old marker sessions with no markerSource. Existing
data cannot reveal whether the distance was measured, paced with a measured shoe,
or inferred from shoe size. Do not guess a precise reference uncertainty.

The new types describe measured markers at about 0.5%, paced measured-shoe at 1%,
and paced shoe-size at 5%, differing from the earlier generic 3% pacing proposal.
Use AB's final helper rather than duplicating or hardcoding either table here.
Confirm whether the pixel-mark uncertainty is in video coordinates or extracted
frame coordinates, and how scaling is handled.

## Outstanding dependency: bounce confidence

No confidence field or behaviour has landed. AB must define the prompt, whether
uncertain marks block measurement or yield a labelled estimate, the stored field,
and the treatment of legacy recordings. No guessed confidence is saved here.

## AB integration

History can remove matchTrend and use the point's id/error directly. Analysis can
use getSession(id), rendering missing and corrupt states separately. The current
screens are untouched and continue using their existing workaround until AB edits
them. Basit alone merges; user requested local storage only for this delivery.

## Verification

- npm test: 47/47 passed, including five new behavioural tests covering direct
  reads, legacy versions, marker metadata, Trend ties/ranges, shoe-length edits.
- npm run typecheck: passed against AB's new shared types.
- node scripts/check-review-boundary.cjs: passed against fe78d20.
- git diff --check: passed.
- Android Expo export: passed; 2,000 modules compiled to Hermes bytecode in
  node_modules/.cache/trend-session-bundle. This is a bundle check, not an APK
  build or a test on a phone.
- Phone tests and integrated uncertainty/confidence acceptance remain pending.

Delivery date: Wednesday 16 September 2026. AB merge planned Thursday 17 September.
Confirm the freeze wording: 18 September is Friday, not Thursday.
