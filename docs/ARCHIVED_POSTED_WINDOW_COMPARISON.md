# Archived Posted-Window Comparison Engine

Status: archived and inactive as of 2026-09-22.

LCPTMS now predicts boarding windows independently from NOAA current and tide data. No active route, scheduled workflow, learning capture, UI component, or diagnostic fetch compares boarding windows against the LakeCharlesPilots.com schedule sheet.

## Preserved implementation history

The complete implementation remains recoverable from Git history. Important commits include:

- `98d6c39` - add the twice-daily posted-window workflow
- `de97d80` - add the posted-window capture route
- `5971f1c` - improve posted-window parsing
- `b8f1058` - extend structured schedule access
- `56b5367` - add encrypted comparison storage
- `1684896` - add workflow diagnostics
- `86a985f` - parse nested encoded schedule records
- `add9f1b` - unwrap nested official schedule payloads
- `4288cd7` - allow the protected diagnostic to use the learning authorization

## What the archived engine did

- Authenticated to the schedule site server-side.
- Queried `GetTideSetForDateAndDays` every 12 hours.
- Parsed posted OPEN/CLOSE windows.
- Compared posted times with raw and bias-adjusted LCPTMS calculations.
- Calculated signed opening/closing differences, mean absolute error, maximum absolute error, and duration differences.
- Stored encrypted results in private Vercel Blob paths under `lcptms-learning-v1/official-windows/`.

## Last diagnostic result

The endpoint returned HTTP 200 with 20 records. Observed fields were:

- `TideStartTime`
- `TideEndTime`
- `AdjTideStartTime`
- `AdjTideEndTime`
- `TideStartPred`
- `TideEndPred`

Run 3 completed successfully but parsed zero posted windows because the returned records did not include the category labels expected by the comparison model. The final field-mapping investigation was intentionally stopped before activation.

## Inactive components retained for possible future recovery

- `lib/boardingWindowValidation.js`
- The archived comparison helpers in `lib/persistentLearningEngine.js`
- The official-window storage helpers in `lib/persistentLearningStore.js`
- The dormant current-set helper functions in `lib/lcpStructuredSchedule.js`

These modules have no active production call path for boarding-window comparison.

## Requirements before any future reactivation

1. Obtain explicit authorization to retrieve and store the posted schedule-sheet data.
2. Confirm the meaning of the six tide/current-set fields and how each record maps to an LCPTMS boarding-window category.
3. Restore the workflow and route calls in a separate reviewable change.
4. Run parser fixtures and a production smoke test before enabling a schedule.

