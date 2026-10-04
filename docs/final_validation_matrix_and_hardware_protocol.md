# PJT-I Final Validation Matrix and Hardware Protocol

This document is the pre-hardware validation record for PJT-I at commit
`00ee047` (`Finalize application UI consistency`). It distinguishes verified
software behavior from behavior that can only be established on a physical
Android device. It does not contain physical measurements.

## Validation status definitions

- **SOFTWARE-VALIDATED** — automated tests or deterministic source-level
  validation exercise the implemented behavior.
- **HARDWARE-PENDING** — the implementation exists, but meaningful validation
  requires a physical IMU/device.
- **PARTIALLY-VALIDATED** — software behavior is validated, but its physical
  behavior still requires confirmation.
- **NOT-APPLICABLE / FUTURE** — intentionally outside the current phone
  prototype.

`Hardware Needed` means hardware evidence is still required for the physical
claim. A `Yes` value does not invalidate deterministic software evidence.

| Classification | Audited items |
|---|---:|
| SOFTWARE-VALIDATED | 88 |
| HARDWARE-PENDING | 2 |
| PARTIALLY-VALIDATED | 9 |
| NOT-APPLICABLE / FUTURE | 5 |
| **Total** | **104** |

## Requirements-to-implementation matrix

### Sensor and acquisition

| Requirement | Implementation | Validation evidence | Status | Hardware Needed |
|---|---|---|---|---|
| Accelerometer acquisition | `services/imuService.ts` (`Accelerometer.addListener`) | Source inspection; SDK integration compiles and exports | HARDWARE-PENDING | Yes |
| Gyroscope acquisition | `services/imuService.ts` (`Gyroscope.addListener`, cached latest value) | Source inspection; SDK integration compiles and exports | HARDWARE-PENDING | Yes |
| Approximately 50 Hz target | Both sensors request a 20 ms update interval in `services/imuService.ts` | Static contract checks and TypeScript; actual cadence is platform-controlled | PARTIALLY-VALIDATED | Yes |
| Timestamp generation | Accelerometer-driven samples use `Date.now()` in `services/imuService.ts` | Source inspection and full-pipeline synthetic timestamps | PARTIALLY-VALIDATED | Yes |
| Invalid/non-monotonic interval handling | `App.tsx` rejects `dt <= 0` and `dt > 1`, then re-bases the previous timestamp | `test/adaptiveSystemEvaluation.test.mjs`; source inspection | SOFTWARE-VALIDATED | No |
| Actual sampling-rate recording | `processing/sessionRecorder.ts` calculates samples per elapsed monitoring second; `App.tsx` exposes live diagnostics | `test/adaptiveFullIntegration.test.mjs`; `test/adaptiveThresholdLongSession.test.mjs` | PARTIALLY-VALIDATED | Yes |

### Orientation

| Requirement | Implementation | Validation evidence | Status | Hardware Needed |
|---|---|---|---|---|
| Complementary filter | `processing/orientation.ts`, `ALPHA = 0.98` | `test/adaptiveSystemEvaluation.test.mjs` frozen-orientation contract | SOFTWARE-VALIDATED | Yes |
| Accelerometer long-term reference | Accelerometer pitch/roll contribute `(1 - ALPHA)` | Same frozen-orientation contract | SOFTWARE-VALIDATED | Yes |
| Gyroscope short-term response | Gyroscope integration contributes `ALPHA` | Same frozen-orientation contract | SOFTWARE-VALIDATED | Yes |
| Pitch estimation | `atan2(-ax, sqrt(ay² + az²))` plus `gy × dt` | Same frozen-orientation contract | SOFTWARE-VALIDATED | Yes |
| Roll estimation | `atan2(ay, az)` plus `gx × dt` | Same frozen-orientation contract | SOFTWARE-VALIDATED | Yes |
| Sensor/body mapping | `BodyPitch = 90 - SensorRoll`; `BodyRoll = SensorPitch` | Deterministic mapping test in `test/adaptiveSystemEvaluation.test.mjs` | PARTIALLY-VALIDATED | Yes |

### Calibration

| Requirement | Implementation | Validation evidence | Status | Hardware Needed |
|---|---|---|---|---|
| Personalized pitch/roll baseline | Mean of calibration samples in `processing/calibration.ts` | `test/adaptiveSystemEvaluation.test.mjs`; `test/monitoringLifecycle.test.mjs` | SOFTWARE-VALIDATED | Yes |
| Pitch/roll standard deviation | Population standard deviation in `processing/calibration.ts` | Same calibration contract tests | SOFTWARE-VALIDATED | Yes |
| Confidence and validity | Confidence derived from 4° engineering limits; validity requires both axes within limits | Same calibration contract tests | SOFTWARE-VALIDATED | Yes |
| Minimum sample requirement | Fewer than 100 samples returns invalid calibration | Same calibration contract tests | SOFTWARE-VALIDATED | Yes |
| Calibration persistence in calibrated idle | Valid result remains while monitoring stops and restarts | `test/monitoringLifecycle.test.mjs` | SOFTWARE-VALIDATED | No |
| Recalibration guard while monitoring | Early return in `App.tsx::startCalibration` | `test/monitoringLifecycle.test.mjs`; `test/adaptiveFullIntegration.test.mjs` | SOFTWARE-VALIDATED | No |

### Posture detection

| Requirement | Implementation | Validation evidence | Status | Hardware Needed |
|---|---|---|---|---|
| Personalized deviation | Absolute difference from calibration baselines in `processing/deviation.ts` | `test/adaptiveSystemEvaluation.test.mjs`; full integration tests | SOFTWARE-VALIDATED | Yes |
| Axis-specific thresholds | Independent pitch/roll standard deviations and adaptive adjustments | Adaptive threshold unit and long-session tests | SOFTWARE-VALIDATED | Yes |
| Overall deviation | Logical OR of pitch/roll outside states | Full integration and frozen-contract tests | SOFTWARE-VALIDATED | Yes |
| Dominant-axis direction classification | `App.tsx::determinePostureDirection` selects the larger axis deviation | Full integration source contract | SOFTWARE-VALIDATED | Yes |
| Forward/backward/left/right/neutral semantics | Signed body movement maps to the five `PostureDirection` values | Session and integration contracts | PARTIALLY-VALIDATED | Yes |

### Noise suppression

| Requirement | Implementation | Validation evidence | Status | Hardware Needed |
|---|---|---|---|---|
| Complementary filtering layer | `processing/orientation.ts` | Frozen-orientation contract | SOFTWARE-VALIDATED | Yes |
| Stability detection | Two-second rolling window, 2° limits, minimum 10 samples in `processing/stability.ts`/`App.tsx` | `test/adaptiveSystemEvaluation.test.mjs`; full integration tests | SOFTWARE-VALIDATED | Yes |
| Persistence detection | Three-second sustained state in `processing/persistence.ts`, fed only stable deviations by `App.tsx` | Same frozen pipeline and integration tests | SOFTWARE-VALIDATED | Yes |
| Transient suppression | Instability resets persistence before feedback eligibility | Synthetic integration tests | PARTIALLY-VALIDATED | Yes |

### Feedback

| Requirement | Implementation | Validation evidence | Status | Hardware Needed |
|---|---|---|---|---|
| Haptic feedback | `services/hapticService.ts` uses Expo haptics and repeating React Native vibration | Source inspection; lifecycle calls are integration-tested | PARTIALLY-VALIDATED | Yes |
| Feedback lifecycle | Correction, stop, recalibration, new session, and cleanup stop vibration/reassertion | Adaptive feedback, lifecycle, and full integration tests | SOFTWARE-VALIDATED | Yes |
| Feedback event recording | `processing/sessionRecorder.ts::recordFeedbackEvent` rejects non-finite and duplicate timestamp events | Full integration and persisted-schema tests | SOFTWARE-VALIDATED | No |
| Adaptive feedback modes | `NORMAL`, `PERSISTENT`, `HIGH_PERSISTENCE` from bounded completed-response history | `test/adaptiveFeedback.test.mjs`; `test/adaptiveSystemEvaluation.test.mjs` | SOFTWARE-VALIDATED | Yes |
| Persistence/reassertion behavior | No timer, six-second timer, or three-second timer by mode | `test/adaptiveFeedback.test.mjs` | SOFTWARE-VALIDATED | Yes |

### Correction response

| Requirement | Implementation | Validation evidence | Status | Hardware Needed |
|---|---|---|---|---|
| Observation lifecycle | `WAITING`, `OBSERVING`, `CORRECTED` in `processing/correctionResponse.ts` | Adaptive feedback and full integration tests | SOFTWARE-VALIDATED | Yes |
| Axis-specific correction detection | Pitch directions require pitch correction; roll directions require roll correction | `test/adaptiveFeedback.test.mjs`; `test/adaptiveSystemEvaluation.test.mjs` | SOFTWARE-VALIDATED | Yes |
| Response time | Difference between correction and feedback timestamps | Full integration and adaptive-system evaluation tests | SOFTWARE-VALIDATED | Yes |
| Duplicate prevention | One completed response per feedback timestamp | `processing/sessionRecorder.ts`; full integration tests | SOFTWARE-VALIDATED | No |
| Completed correction recording | Completed detector state is converted to the persisted response shape in `App.tsx` | Full integration and backend schema tests | SOFTWARE-VALIDATED | No |

### Adaptive threshold

| Requirement | Implementation | Validation evidence | Status | Hardware Needed |
|---|---|---|---|---|
| Five normalized behavioral features | `processing/adaptiveThresholdFeatures.ts` | `test/adaptiveThreshold.test.mjs` | SOFTWARE-VALIDATED | Yes |
| Equal feature weighting | `combineEqualWeightEvidence` arithmetic mean | `test/adaptiveThreshold.test.mjs`; long-session tests | SOFTWARE-VALIDATED | No |
| Short-term EMA | Timestamp-aware feature EMAs | Adaptive threshold unit, DEMO, and long-session tests | SOFTWARE-VALIDATED | Yes |
| Long-term EMA | Timestamp-aware feature EMAs | Same tests | SOFTWARE-VALIDATED | Yes |
| Evidence EMA | Axis diagnostics and controller state | Same tests | SOFTWARE-VALIDATED | Yes |
| Independent pitch/roll adaptation | Separate axis feature/controller state | Unit and long-session axis-specific tests | SOFTWARE-VALIDATED | Yes |
| Bounded adjustment | `MAX_ADAPTIVE_ADJUSTMENT` cap | Unit, DEMO safety, and long-session tests | SOFTWARE-VALIDATED | No |
| Canonical baseline immutability | Adjustments alter effective thresholds, not calibration | Unit and system-evaluation tests | SOFTWARE-VALIDATED | No |
| Gradual recovery | Evidence and adjustment return toward baseline | Unit, DEMO, and long-session recovery tests | SOFTWARE-VALIDATED | Yes |
| Insufficient-data gate | Controller freezes until configured evidence counts are available | Unit and DEMO safety tests | SOFTWARE-VALIDATED | No |
| Instability gate | Unstable posture freezes adaptation | Unit, DEMO safety, and long-session tests | SOFTWARE-VALIDATED | Yes |
| Severe-deviation veto | Severe deviation prevents additional relaxation | Unit, DEMO safety, system-evaluation, and long-session tests | SOFTWARE-VALIDATED | Yes |
| Major-deterioration gate | Simultaneous major deterioration prevents relaxation | Unit, DEMO safety, and long-session tests | SOFTWARE-VALIDATED | Yes |
| Session isolation | All feature, EMA, and adjustment state resets | Unit, lifecycle, full integration, and long-session tests | SOFTWARE-VALIDATED | No |

### Session and metrics

| Requirement | Implementation | Validation evidence | Status | Hardware Needed |
|---|---|---|---|---|
| Session creation | `processing/sessionRecorder.ts::startSession` snapshots calibration and creates unique ID | Monitoring lifecycle and full integration tests | SOFTWARE-VALIDATED | No |
| Sample recording | Finite sample validation, first-sample start time, count tracking | Full integration tests | SOFTWARE-VALIDATED | No |
| Feedback recording | Finite validation and timestamp de-duplication | Full integration tests | SOFTWARE-VALIDATED | No |
| Correction recording | Finite validation and feedback-ID de-duplication | Full integration tests | SOFTWARE-VALIDATED | No |
| Session finalization | End time, non-negative duration, and measured rate | Monitoring lifecycle and full integration tests | SOFTWARE-VALIDATED | No |
| Consistency | Good-posture time divided by monitored duration, clamped 0–100 | Full integration and backend analytics tests | SOFTWARE-VALIDATED | No |
| Good-posture time | Positive intervals whose leading sample is acceptable | Full integration tests | SOFTWARE-VALIDATED | No |
| Longest good-posture period | Longest continuous acceptable interval | Full integration tests | SOFTWARE-VALIDATED | No |
| Correction completion rate | Completed corrections divided by feedback events | Full integration and backend analytics tests | SOFTWARE-VALIDATED | No |
| Average correction time | Mean of completed correction response times or `null` | Full integration and backend analytics tests | SOFTWARE-VALIDATED | No |
| Direction-specific metrics | Feedback counts and response-time means per direction | Full integration and backend analytics tests | SOFTWARE-VALIDATED | No |
| Actual sampling rate metric | Finalized session rate is copied into metrics | Full integration tests | SOFTWARE-VALIDATED | No |
| Monitored duration metric | Finalized duration is copied into metrics | Monitoring lifecycle and full integration tests | SOFTWARE-VALIDATED | No |
| Sample count metric | Recorded sample count is copied into metrics | Full integration and backend validation tests | SOFTWARE-VALIDATED | No |

### Persistence and backend

| Requirement | Implementation | Validation evidence | Status | Hardware Needed |
|---|---|---|---|---|
| Asynchronous session upload | `services/apiService.ts::uploadSession`; `App.tsx` finalizes locally first | Application lifecycle UX and backend regression tests | SOFTWARE-VALIDATED | No |
| Runtime payload validation | `backend/src/routes/sessions.ts` validates complete nested session/metrics structure and finite values | `backend/test/sessions.test.ts` | SOFTWARE-VALIDATED | No |
| Duplicate handling | Existing ID returns HTTP 409 | Backend regression test | SOFTWARE-VALIDATED | No |
| Same-session retry | Finalized pending payload remains available for manual retry | Application lifecycle UX and monitoring lifecycle tests | SOFTWARE-VALIDATED | No |
| Possibly-saved state | HTTP 409 is surfaced as a terminal possibly-saved outcome and history refresh | Application lifecycle UX source contracts | SOFTWARE-VALIDATED | No |
| Backend-independent real-time monitoring | Network work starts only after local finalization and remains outside the IMU loop | Architecture/source validation and lifecycle tests | PARTIALLY-VALIDATED | Yes |
| Historical session retrieval | `GET /api/sessions` and `GET /api/sessions/:id` | Backend regression test | SOFTWARE-VALIDATED | No |

### Historical analytics

| Requirement | Implementation | Validation evidence | Status | Hardware Needed |
|---|---|---|---|---|
| Summary endpoint | `GET /api/metrics/summary` | Backend regression test | SOFTWARE-VALIDATED | No |
| Duration-weighted consistency | Total good-posture time divided by total monitored duration in `backend/src/analytics.ts` | Multi-session backend analytics test | SOFTWARE-VALIDATED | No |
| Correction completion trends | Per-session completed corrections and completion rate | Backend regression and dashboard tests | SOFTWARE-VALIDATED | No |
| Correction-time trends | Per-session and aggregate completed response times | Backend regression and dashboard tests | SOFTWARE-VALIDATED | No |
| Monitoring-duration trends | Stored session duration exposed by trends endpoint | Backend regression and dashboard tests | SOFTWARE-VALIDATED | No |
| Recent sessions | Dashboard displays a bounded recent subset without changing aggregate totals | `test/historicalAnalyticsDashboard.test.mjs` | SOFTWARE-VALIDATED | No |
| Selected-session analysis | Existing full session endpoint feeds `SessionResultsDashboard` | Application lifecycle UX and dashboard tests | SOFTWARE-VALIDATED | No |
| Loading/error/empty states | `HistoricalAnalyticsDashboard.tsx` | Dashboard, lifecycle UX, and UI consistency tests | SOFTWARE-VALIDATED | No |

### Application lifecycle

| Requirement | Implementation | Validation evidence | Status | Hardware Needed |
|---|---|---|---|---|
| Calibration entry/completion | `App.tsx::startCalibration` and sensor callback | Monitoring lifecycle tests | SOFTWARE-VALIDATED | Yes |
| Calibrated idle | Valid calibration does not automatically start monitoring | Monitoring lifecycle tests | SOFTWARE-VALIDATED | No |
| Monitoring start | Explicit action creates a new isolated session | Monitoring lifecycle tests | SOFTWARE-VALIDATED | No |
| Stop monitoring | Stops real-time processing/feedback and finalizes once | Monitoring lifecycle and full integration tests | SOFTWARE-VALIDATED | No |
| Session finalization | Local session and metrics are available before upload settles | Application lifecycle UX tests | SOFTWARE-VALIDATED | No |
| Upload lifecycle | Uploading, saved, failed, and possibly-saved states | Application lifecycle UX tests | SOFTWARE-VALIDATED | No |
| Retry lifecycle | Same finalized session is retried without replacement | Application lifecycle UX and monitoring lifecycle tests | SOFTWARE-VALIDATED | No |
| History lifecycle | Startup/manual/post-upload loads are coordinated without polling | Historical dashboard and lifecycle UX tests | SOFTWARE-VALIDATED | No |
| Historical session selection | Detail reuses results UI without replacing local result | Application lifecycle UX tests | SOFTWARE-VALIDATED | No |
| Starting another session | Allowed only after terminal upload outcome; canonical calibration retained | Monitoring lifecycle and application lifecycle UX tests | SOFTWARE-VALIDATED | No |
| Session isolation | Adaptive, correction, stability, persistence, feedback, and dashboard state reset | Monitoring lifecycle, full integration, and long-session tests | SOFTWARE-VALIDATED | No |

### User interface

| Requirement | Implementation | Validation evidence | Status | Hardware Needed |
|---|---|---|---|---|
| Monitoring dashboard | `App.tsx`, throttled 5 Hz dashboard snapshot | Full integration source contracts and UI consistency tests | SOFTWARE-VALIDATED | Yes |
| Session results | `components/SessionResultsDashboard.tsx` | Application lifecycle UX and UI consistency tests | SOFTWARE-VALIDATED | No |
| Historical analytics | `components/HistoricalAnalyticsDashboard.tsx` | Historical dashboard and UI consistency tests | SOFTWARE-VALIDATED | No |
| Status indicators | Shared symbols and tone styles | `test/uiConsistency.test.mjs` | SOFTWARE-VALIDATED | No |
| Lifecycle states | Monitor/results/history local view state | `test/applicationLifecycleUx.test.mjs` | SOFTWARE-VALIDATED | No |
| Upload states | Results dashboard exposes all persistence outcomes and retry | Application lifecycle UX tests | SOFTWARE-VALIDATED | No |
| DEMO disclosure | Shared exact label `DEMO — ACCELERATED ADAPTIVE TIMING` | Adaptive DEMO and UI consistency tests | SOFTWARE-VALIDATED | No |
| Responsive mobile layout | Flexible card grids, bounded chart subsets, and minimum touch targets | Static UI consistency tests and successful Android export | PARTIALLY-VALIDATED | Yes |

### Explicit future boundaries

| Requirement | Implementation | Validation evidence | Status | Hardware Needed |
|---|---|---|---|---|
| MPU6050 + ESP32 belt | Not implemented; phone IMU remains the active source | Repository and architecture inspection | NOT-APPLICABLE / FUTURE | Yes |
| Physical belt actuator | Not implemented; phone vibration remains active | Repository and architecture inspection | NOT-APPLICABLE / FUTURE | Yes |
| Variable vibration amplitude | Not implemented by the phone prototype | Haptic service and master context inspection | NOT-APPLICABLE / FUTURE | Yes |
| Physiological fatigue detection | Not implemented or claimed | Adaptive feature/controller inspection | NOT-APPLICABLE / FUTURE | Yes |
| Production adaptive timing | Defined but intentionally not active until after hardware validation | `processing/adaptiveThresholdConfig.ts`; DEMO tests | NOT-APPLICABLE / FUTURE | Yes |

## Software-frozen components

During hardware validation, treat the following as frozen unless a repeatable,
recorded physical observation demonstrates a problem:

- orientation equations and `ALPHA = 0.98` in `processing/orientation.ts`;
- portrait sensor/body mapping in `processing/orientation.ts`;
- calibration duration, sample minimum, calculations, and validity limits;
- personalized deviation equations and canonical thresholds;
- two-second stability and three-second persistence behavior;
- direction and axis-specific correction semantics;
- adaptive threshold feature definitions, EMA architecture, gates, safety vetoes,
  cap, recovery, and session isolation;
- adaptive feedback response classification, modes, and reassertion behavior;
- session schema and metric definitions;
- frontend upload/retry semantics;
- backend routes, validation contract, SQLite schema, and analytics definitions.

An unexpected observation must first be reproduced and documented. It must not
be converted directly into parameter or algorithm changes during the experiment.

## Physical validation still pending

The following are pending physical validation, not software failures:

- delivered Android accelerometer/gyroscope callback rate and timestamp cadence;
- physical sensor noise, gaps, and spikes;
- phone mounting orientation, repeatability, and body coupling;
- repeated on-body calibration stability and baseline drift;
- physical forward/backward/left/right correspondence;
- transient human movement through stability/persistence filtering;
- phone-vibration perception, onset, continuity, and correction stop;
- adaptive evidence and threshold behavior under controlled human movement;
- monitoring and local recording with real backend loss;
- practical limitations of using a phone as the body-mounted IMU.

## Hardware experiment rules

For every experiment, record four separate statements:

1. **Algorithmic expectation** — what the implementation deterministically
   guarantees.
2. **Experimental expectation** — what is physically expected without inventing
   a new numeric threshold.
3. **Observation** — the actual recorded values and behavior.
4. **Conclusion** — `PASS`, `FAIL`, or `INCONCLUSIVE`.

Do not tune thresholds during a run. Preserve screenshots, screen recordings,
development diagnostic snapshots, completed-session results, backend records,
timestamps, and written mounting/physical observations when the application can
produce them.

## Definitive hardware experiment protocol

### Experiment A — Device and sensor readiness

- Record device model, Android version, app commit, date/time, physical phone/IMU
  location, portrait mounting orientation, and backend availability.
- Confirm `adb devices -l` lists an authorized device.
- Launch the Expo application and confirm sensor acquisition and the existing
  `[PJT-I device validation]` snapshots appear during monitoring.
- Evidence: ADB output, setup photograph/notes, launch screenshot, diagnostic
  snapshot.

### Experiment B — Sampling rate and timestamp cadence

1. Calibrate, start monitoring, and remain approximately still.
2. Observe diagnostics for at least several snapshots.
3. Record displayed/reported sampling rate, observed minimum and maximum, gaps or
   spikes, and whether timestamps are monotonic.
4. Compare with the approximate 50 Hz target; do not require exactly 50.0 Hz.
- Evidence: timestamped diagnostics and session result sampling rate.

### Experiment C — Repeated calibration stability

1. Mount consistently and assume a natural upright posture.
2. Complete calibration without changing the 30-second duration or limits.
3. Record baseline, standard deviation, sample count, duration, confidence, and
   validity for both axes.
4. Repeat under approximately the same conditions and compare without inventing
   a new acceptance range.
- Evidence: both calibration result screens and setup notes.

### Experiment D — Normal posture

- Maintain calibrated upright posture and record pitch, roll, deviations,
  thresholds, stability, persistence, and feedback.
- Experimental expectation: normal posture should not produce unnecessary
  feedback.
- Evidence: diagnostics, dashboard recording, and physical notes.

### Experiment E — Small/transient deviation

- Perform one short deviation and immediately return upright.
- Record maximum observed deviation, stability, persistence, and feedback.
- Algorithmic expectation: only stable deviation contributes to persistence, and
  persistence must reach three seconds before feedback eligibility.
- Evidence: screen recording and diagnostics.

### Experiment F — Stable poor posture by direction

- Test forward, backward, left, and right separately.
- For each, record direction, deviation, threshold, stability, persistence,
  feedback onset, and correction response.
- Evidence: one result row and relevant diagnostic/screen evidence per direction.

### Experiment G — Habitual poor posture

- Maintain/repeat relatively stable poor posture without deliberately progressive
  deterioration.
- Record normalized behavioral features, short/long EMAs, evidence EMA, and
  effective thresholds.
- Algorithmic expectation: poor posture alone must not create runaway threshold
  relaxation.
- Evidence: diagnostics and completed-session results.

### Experiment H — Progressive deterioration

- Create a controlled prolonged-use sequence with progressively worsening
  posture while recording all five normalized features, short/long EMAs,
  evidence EMA, adjustment, and effective threshold.
- Algorithmic expectation: multi-feature evidence may cause gradual bounded
  adaptation only while safety gates permit it; elapsed time alone is not
  evidence.
- Evidence: timestamped diagnostics, screen recording, and session result.

### Experiment I — Severe-deviation safety veto

- Create a clearly severe deviation without changing constants.
- Record severe-deviation state, evidence, current adjustment, and effective
  threshold.
- Algorithmic expectation: severe deviation prevents further relaxation.
- Evidence: diagnostic snapshots around the veto.

### Experiment J — Recovery

- After an adapted prolonged sequence, return to good posture.
- Record evidence/EMA recovery, adjustment, effective threshold, and feedback
  mode over time.
- Algorithmic expectation: adjustment returns gradually toward the canonical
  threshold.
- Evidence: diagnostics and screen recording.

### Experiment K — Correction response

1. Produce a feedback-eligible deviation and correct quickly.
2. In a separate observation, correct slowly.
3. Record feedback/correction timestamps, calculated response time, direction,
   and adaptive feedback mode. Use the implemented classification.
- Evidence: diagnostics and correction entries in session results.

### Experiment L — Session isolation

1. Develop adaptive state during Session 1 and stop it normally.
2. Start Session 2 without recalibrating.
3. Confirm adaptive feature/EMA state, threshold adjustment, adaptive feedback,
   correction observation, stability, and persistence reset.
- Evidence: end/start diagnostic snapshots and both session identifiers.

### Experiment M — Recalibration reset

1. After a completed and terminally synchronized session, recalibrate.
2. Record the replacement canonical calibration.
3. Start a new session and confirm no prior adaptive/correction state leaks.
- Evidence: old/new calibration results and first new-session diagnostics.

### Experiment N — Backend independence

1. Record backend availability, then make the backend unavailable before or
   during monitoring.
2. Confirm IMU processing, posture detection, feedback, and local session
   recording continue.
3. Stop normally and record the upload state; retry only after restoring the
   backend.
- Evidence: backend terminal state, live dashboard/diagnostics, local results,
  failed upload state, and subsequent retry result.

## Reusable experiment result template

Copy this block for every experiment. Leave unavailable fields blank.

```text
Experiment:
Date/time:
Operator:
Device model:
Android version:
Application commit:
Expo/runtime:
Physical mounting location:
Mounting orientation:
Backend availability:

Procedure performed:

Algorithmic expectation:

Experimental expectation:

Observed software values:
  sampling rate:
  timestamp range/monotonicity:
  pitch range:
  roll range:
  pitch baseline/std/threshold:
  roll baseline/std/threshold:
  calibration sample count/duration/confidence/validity:
  stability:
  persistence:
  feedback:
  correction response:
  adaptive features/EMAs/evidence:
  canonical/effective thresholds and adjustment:
  adaptive feedback mode:

Observed physical behavior:

Evidence retained:

Result: PASS / FAIL / INCONCLUSIVE

Notes:
```

For Experiment F, also complete:

| Movement | Expected software direction | Observed direction | Result |
|---|---|---|---|
| Forward | forward |  |  |
| Backward | backward |  |  |
| Left | left |  |  |
| Right | right |  |  |

## Timing and next activity

The active adaptive threshold configuration remains intentionally `DEMO` for
real-device validation. No switch is provided and no constants are changed by
this checkpoint. The `DEMO` → `PRODUCTION` switch is postponed until physical
validation is complete and recorded. The next development activity is the
physical-device protocol above, followed by the timing switch, final regression,
evaluation, report, presentation, and demonstration.
