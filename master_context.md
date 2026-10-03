# MASTER CONTEXT --- PJT-I

# PERSONALIZED ADAPTIVE POSTURE CORRECTION BELT

## 1. PROJECT OVERVIEW

PJT-I is a low-cost wearable posture monitoring and correction system
designed to monitor a user's posture, detect personalized deviations
from their natural posture, provide real-time haptic feedback, measure
whether the user corrects the posture, store completed sessions, and
analyze historical performance.

The main research contribution is **algorithmic personalization and
adaptation**, rather than novel hardware.

The intended final hardware platform is:

-   MPU6050 IMU
-   ESP32 microcontroller
-   Vibration motor
-   Battery

The current working prototype uses:

-   Android smartphone
-   React Native
-   TypeScript
-   Expo
-   `expo-sensors`
-   Expo/React Native haptics/vibration
-   Node.js backend
-   Express
-   TypeScript
-   SQLite
-   `better-sqlite3`

The current system is already working end-to-end from the Android Expo
application to the Node.js backend and SQLite database.

------------------------------------------------------------------------

# 2. PROJECT OBJECTIVE

The system should:

1.  Measure body orientation using IMU data.
2.  Estimate pitch and roll.
3.  Reduce orientation noise using a complementary filter.
4.  Establish the user's natural posture through calibration.
5.  Calculate personalized posture-deviation thresholds.
6.  Suppress false alarms caused by transient motion/noise.
7.  Detect sustained posture deviation.
8.  Provide real-time vibration feedback.
9.  Identify the dominant direction of deviation.
10. Detect whether the user corrected the posture.
11. Measure correction response time.
12. Calculate posture-performance metrics.
13. Persist completed sessions in a backend database.
14. Provide historical analytics.
15. Eventually adapt feedback parameters based on historical user
    behavior.

The backend must **not** sit inside the real-time IMU → posture
detection → feedback loop because network/database latency must not
affect real-time feedback.

------------------------------------------------------------------------

# 3. CORE SYSTEM PIPELINE

The current conceptual processing pipeline is:

``` text
Raw IMU Data
    ↓
Orientation Estimation
    ↓
Complementary Filter
    ↓
Sensor-to-Body Mapping
    ↓
Personalized Calibration
    ↓
Adaptive Deviation Threshold
    ↓
Personalized Deviation Detection
    ↓
Stability Detection
    ↓
Persistence Detection
    ↓
Feedback Controller
    ↓
Adaptive Feedback Persistence
    ↓
Haptic Feedback
    ↓
Correction Response Detection
    ↓
Performance Metrics
    ↓
Session Persistence
    ↓
Backend / SQLite
    ↓
Historical Analytics
```

The first part of this pipeline is real-time and local to the device.

The backend is primarily responsible for persistence and historical
analysis.

------------------------------------------------------------------------

# 4. CURRENT PROJECT STRUCTURE

Current relevant structure:

``` text
posture-belt/
├── package.json
├── package-lock.json
├── tsconfig.json
├── app.json
├── App.tsx
├── .gitignore
├── AGENTS.md
├── master_context.md
│
├── models/
│   └── postureModel.ts
│
├── processing/
│   ├── calibration.ts
│   ├── adaptiveFeedback.ts
│   ├── adaptiveThreshold.ts
│   ├── adaptiveThresholdFeatures.ts
│   ├── correctionResponse.ts
│   ├── deviation.ts
│   ├── feedback.ts
│   ├── orientation.ts
│   ├── performanceMetrics.ts
│   ├── persistence.ts
│   ├── sessionRecorder.ts
│   └── stability.ts
├── test/
│   ├── adaptiveFeedback.test.mjs
│   ├── adaptiveSystemEvaluation.test.mjs
│   ├── adaptiveThreshold.test.mjs
│   └── loadTypeScriptModule.mjs
│
├── services/
│   ├── imuService.ts
│   ├── hapticService.ts
│   └── apiService.ts
│
├── assets/
│   └── ...
│
└── backend/
    ├── package.json
    ├── package-lock.json
    ├── tsconfig.json
    ├── posture.db                  # runtime data, ignored by Git
    ├── src/
        ├── analytics.ts
        ├── database.ts
        ├── server.ts
        └── routes/
            ├── metrics.ts
            └── sessions.ts
    └── test/
        └── sessions.test.ts
```

There are intentionally two `package.json` files:

``` text
/Users/dracon/posture-belt/package.json
```

is the Expo frontend package.

``` text
/Users/dracon/posture-belt/backend/package.json
```

is the Node.js backend package.

------------------------------------------------------------------------

# 5. RUNNING THE PROJECT

## Frontend

Run Expo from the project root:

``` bash
cd /Users/dracon/posture-belt
npx expo start
```

The root directory must contain the frontend `package.json`.

An earlier issue occurred when Expo was run from the wrong directory:

``` text
ConfigError: The expected package.json path:
 /Users/dracon/posture-belt/package.json does not exist
```

This was resolved by ensuring the frontend package exists at the project
root and running Expo from there.

------------------------------------------------------------------------

## Backend

Run the backend separately:

``` bash
cd /Users/dracon/posture-belt/backend
npm run dev
```

The backend should report:

``` text
PJT-I backend running on port 3000
```

------------------------------------------------------------------------

# 6. HARDWARE ARCHITECTURE

## Final intended hardware

### MPU6050

Provides:

-   3-axis accelerometer
-   3-axis gyroscope

The accelerometer provides information about the gravity vector.

The gyroscope measures angular velocity.

------------------------------------------------------------------------

## ESP32

Responsibilities:

-   Read MPU6050 data.
-   Perform local sensor processing.
-   Communicate processed sensor information.
-   Drive the vibration motor.
-   Provide wireless communication to the application/backend
    architecture as required.

------------------------------------------------------------------------

## Vibration motor

Provides tactile feedback to the user.

The final hardware system should reproduce the feedback behavior
currently demonstrated by the smartphone prototype.

------------------------------------------------------------------------

# 7. CURRENT PROTOTYPE HARDWARE

The current prototype does not yet use the physical MPU6050 + ESP32
belt.

Instead:

``` text
Android Smartphone
    ↓
Phone IMU Sensors
    ↓
React Native / Expo
    ↓
Posture Processing
    ↓
Phone Vibration
```

This allows the algorithm and software architecture to be validated
before integrating the final wearable hardware.

------------------------------------------------------------------------

# 8. IMU SERVICE

File:

``` text
services/imuService.ts
```

The current prototype uses:

``` text
Accelerometer.setUpdateInterval(20)
Gyroscope.setUpdateInterval(20)
```

This targets approximately:

``` text
1000 / 20 = 50 Hz
```

Therefore the intended sampling rate is approximately 50 samples/second.

However, the actual callback rate is not guaranteed to be exactly 50 Hz.

The accelerometer callback drives emitted samples while the latest
gyroscope values are cached.

Timestamps are generated using:

``` ts
Date.now()
```

The system therefore records the actual observed sampling rate rather
than assuming the target rate was achieved.

------------------------------------------------------------------------

# 9. ORIENTATION ESTIMATION

File:

``` text
processing/orientation.ts
```

The system estimates:

-   Sensor pitch
-   Sensor roll

from accelerometer and gyroscope data.

## Accelerometer orientation

Current formulas:

``` text
pitch = atan2(-ax, sqrt(ay² + az²))

roll = atan2(ay, az)
```

The accelerometer is useful because gravity provides a long-term
orientation reference.

However, accelerometer measurements can be affected by:

-   movement
-   vibration
-   acceleration other than gravity
-   sensor noise

Therefore accelerometer orientation alone is not sufficient for smooth
real-time posture tracking.

------------------------------------------------------------------------

# 10. GYROSCOPE ROLE

The gyroscope measures angular velocity.

Angular velocity is integrated over time:

``` text
angle_new = angle_old + angular_velocity × dt
```

The gyroscope responds quickly to changes in orientation and short-term
movement.

However, integrating gyro measurements causes drift.

Small measurement errors accumulate over time.

Therefore:

``` text
Gyroscope
→ good short-term motion response
→ vulnerable to long-term drift
```

while:

``` text
Accelerometer
→ provides long-term gravity reference
→ vulnerable to short-term movement/noise
```

------------------------------------------------------------------------

# 11. COMPLEMENTARY FILTER

The system uses a complementary filter with:

``` ts
ALPHA = 0.98
```

Conceptually:

``` text
Filtered Angle =
    0.98 × Gyroscope-based Angle
    +
    0.02 × Accelerometer-based Angle
```

The exact implementation integrates the gyro angle and then combines it
with the accelerometer estimate.

The important interpretation is:

-   Gyroscope contributes most of the short-term dynamic response.
-   Accelerometer continuously corrects long-term drift.
-   The combination is more stable than using either sensor alone.

This is why it is commonly explained as:

> Gravity provides the long-term reference, while the gyroscope provides
> the short-term motion response.

The complementary filter is an important first layer of noise
suppression.

------------------------------------------------------------------------

# 12. SENSOR-TO-BODY MAPPING

The physical orientation of the sensor does not necessarily correspond
directly to the user's anatomical posture axes.

Current mapping:

``` text
BodyPitch = 90 - SensorRoll

BodyRoll = SensorPitch
```

This maps the phone/IMU sensor axes into the project's body-posture
axes.

This mapping must remain consistent throughout calibration, deviation
detection, direction detection, correction response, and metrics.

------------------------------------------------------------------------

# 13. PERSONALIZED CALIBRATION

File:

``` text
processing/calibration.ts
```

The calibration period currently lasts:

``` text
30 seconds
```

The intended research design allows approximately:

``` text
30–60 seconds
```

During calibration the user should sit/stand naturally and comfortably.

The calibration collects:

-   pitch
-   roll
-   timestamps

The resulting calibration contains:

``` text
pitchBaseline
rollBaseline
pitchStd
rollStd
confidence
sampleCount
duration
valid
```

------------------------------------------------------------------------

# 14. CALIBRATION BASELINE

The baseline represents the user's personalized natural posture.

The purpose is not to impose a universal posture angle on every user.

Instead:

``` text
User A → personal baseline
User B → different personal baseline
```

This makes the system personalized.

Calibration should be performed in a comfortable natural posture.

A consistently poor or intentionally distorted posture should not be
used as the baseline because that would teach the system the wrong
reference.

------------------------------------------------------------------------

# 15. CALIBRATION VALIDITY

The current implementation requires:

``` text
minimum samples ≥ 100
```

Engineering validity limits:

``` text
pitch standard deviation ≤ 4°
roll standard deviation ≤ 4°
```

These limits are engineering thresholds for determining whether the
calibration sample is stable enough.

They are **not medical thresholds**.

The calibration confidence is based on the stability and quantity of
collected measurements.

Calibration cannot be restarted while an active monitoring session is
running. `startCalibration()` checks `monitoringActive.current`, and the
"Calibrate Again" control is unavailable during active monitoring. The
user must explicitly stop monitoring, allowing the existing session
finalization, metric calculation, and asynchronous upload lifecycle to
run before recalibrating. Calibration is not adapted or restarted during
an active session.

Recalibration is also unavailable while a completed-session upload is in
progress or after an upload has failed and is awaiting manual retry. The
finalized session and its calculated metrics are retained in memory while
the persistence outcome is unresolved, so starting a new calibration
must not silently discard them. Recalibration becomes available after the
upload reaches `saved` or `possibly-saved`. This protection is in-memory
only and does not imply that pending data survives application
termination.

------------------------------------------------------------------------

# 16. PERSONALIZED DEVIATION DETECTION

File:

``` text
processing/deviation.ts
```

The system does not use only a fixed universal threshold.

It combines:

``` text
minimum threshold
+
user-specific variability
```

Current constants:

``` text
MINIMUM_THRESHOLD = 4°
VARIABILITY_FACTOR = 2
```

Therefore:

``` text
pitchThreshold =
    4° + 2 × pitchStd

rollThreshold =
    4° + 2 × rollStd
```

These values are the immutable session's personalized base thresholds.
The calibration baselines and variability values are never rewritten by
threshold adaptation.

## Adaptive deviation threshold

File:

``` text
processing/adaptiveThreshold.ts
```

The implemented adaptive layer adds an axis-specific, non-negative
adjustment to each personalized base threshold:

``` text
adaptivePitchThreshold = pitchBaseThreshold + pitchAdjustment
adaptiveRollThreshold  = rollBaseThreshold + rollAdjustment
```

Each monitoring session starts with both adjustments at `0°`. The state
is local to that session, resets when monitoring ends, and is never
carried into the next session or obtained from the backend.

Threshold adaptation now uses continuous timestamped behavioral evidence
rather than completed five-minute decision windows:

``` text
Processed posture
        ↓
Behavioral feature extraction
        ↓
Feature normalization
        ↓
Equal-weight evidence
        ↓
Long-term EMA
        ↓
Safety gates
        ↓
Bounded threshold adjustment
```

The five normalized `0–1` features are:

``` text
deviation trend
→ short-term normalized deviation increasing relative to its long-term EMA

deviation frequency
→ short-term outside-threshold frequency increasing relative to long-term

correction-response trend
→ completed correction response times increasing relative to long-term

good-posture duration decline
→ completed good-posture periods becoming shorter

near-threshold exposure
→ time near 75–100% of the applicable threshold increasing over time
```

One large deviation is not itself deviation-trend evidence, and merely
being near the threshold is not classified as bad posture. Pitch and
roll maintain separate posture-feature and evidence state. Completed
correction-response trend is an explicitly shared session context, but
it is only one contributor and cannot directly relax either threshold.

Each normalized feature contributes equally:

``` text
evidence =
    (deviationTrend
     + deviationFrequency
     + correctionTrend
     + goodPostureDecline
     + nearThresholdExposure) / 5
```

Equal weights are intentional. There is no defensible labeled dataset
for physiological exhaustion and no validated reinforcement-learning
reward function, so arbitrary unequal or learned-looking weights would
be unjustified. The equal-weight function is isolated so a future model
can replace it if suitable evidence becomes available. No machine
learning or reinforcement learning is currently implemented.

Feature trends use timestamp-aware two-minute short-term and ten-minute
long-term EMAs. The combined score uses a separate ten-minute EMA, which
persists continuously for the monitoring session rather than resetting
at a fixed window boundary. EMA updates are bounded to `0–1` and depend
on elapsed time rather than an assumed 50 Hz sample rate.

Current safety and adjustment constants are:

``` text
minimum observation duration = 10 minutes
minimum valid processed samples = 100
minimum completed correction responses = 3
minimum completed good-posture periods per axis = 2
evidence activation threshold = 0.30
maximum adaptive adjustment = +3°
maximum adjustment rate = 0.25° per minute
severe deviation = more than 2 × current effective threshold
major deterioration = both deviation-trend and frequency evidence ≥ 0.75
```

Insufficient data, existing stability failure, severe deviation, or
major deterioration freezes threshold movement. High evidence cannot
override these vetoes. When gates pass, the adjustment moves gradually
toward the evidence-derived target. When evidence decreases, it can move
back toward `0°`; the adaptive threshold never becomes a new baseline.
Elapsed movement per sample is capped at one minute of adjustment so a
large timestamp gap cannot cause an abrupt jump.

The existing sample fields `pitchThreshold` and `rollThreshold` store the
effective thresholds used for classification, so no session or backend
schema expansion is required.

This mechanism adapts deviation tolerance only. It uses behavioral
evidence consistent with prolonged-use difficulty and does not claim to
detect physiological fatigue. Adaptive feedback remains a separate
correction-response-based subsystem; its mode and reassertion behavior
are not driven by the threshold evidence EMA.

The current deviations are absolute differences from the personalized
baseline.

Outputs include:

``` text
pitchDeviation
rollDeviation
pitchThreshold
rollThreshold
pitchOutside
rollOutside
overallDeviation
```

------------------------------------------------------------------------

# 17. WHY PERSONALIZED THRESHOLDS ARE USED

Different users naturally maintain posture with different amounts of
small variation.

A universal threshold can cause:

-   too many false alerts for some users
-   insufficient sensitivity for others

The personalized model attempts to account for natural user variability.

Conceptually:

``` text
Deviation tolerance =
minimum safety margin
+
personal natural variability
```

------------------------------------------------------------------------

# 18. NOISE SUPPRESSION STRATEGY

Noise suppression is layered rather than dependent on a single filter.

Current architecture:

``` text
Raw sensor noise
      ↓
Complementary filter
      ↓
Personalized threshold
      ↓
Stability detection
      ↓
Persistence detection
      ↓
Feedback
```

This is important because filtering alone cannot distinguish all
unwanted motion from sustained poor posture.

The system therefore uses multiple stages.

------------------------------------------------------------------------

# 19. STABILITY DETECTION

File:

``` text
processing/stability.ts
```

The system uses a sliding time window of:

``` text
2 seconds
```

Current limits:

``` text
maximum pitch standard deviation = 2°
maximum roll standard deviation = 2°
```

Minimum required samples:

``` text
10
```

A posture is considered stable when:

``` text
pitchStd ≤ 2°
AND
rollStd ≤ 2°
```

This prevents the system from interpreting highly dynamic movement as a
stable posture deviation.

------------------------------------------------------------------------

# 20. PERSISTENCE DETECTION

File:

``` text
processing/persistence.ts
```

Current persistence requirement:

``` text
3 seconds
```

The system accumulates deviation only when:

``` text
overallDeviation == true
AND
stability.stable == true
```

If the deviation or stability condition is lost, persistence is reset.

Therefore a transient event should not immediately generate feedback.

Conceptually:

``` text
Deviation
+
Stable posture
+
3 seconds persistence
=
Feedback eligibility
```

This is another major layer of false-positive suppression.

------------------------------------------------------------------------

# 21. FEEDBACK CONTROLLER

File:

``` text
processing/feedback.ts
```

The feedback controller is stateless.

The current design intentionally does **not** introduce a cooldown.

The configured vibration duration is:

``` text
200 ms
```

However, active testing uses continuous vibration until correction.

No cooldown should be introduced unless explicitly requested because it
would change the currently validated feedback behavior.

------------------------------------------------------------------------

# 22. HAPTIC SERVICE

File:

``` text
services/hapticService.ts
```

The service provides:

``` text
vibrate(duration)
startContinuous()
stop()
```

The continuous behavior uses a repeating vibration pattern:

``` text
[0, 200, 100]
```

with repetition enabled.

Stopping feedback uses:

``` ts
Vibration.cancel()
```

The current implementation uses smartphone vibration as a prototype for
the final physical vibration motor.

------------------------------------------------------------------------

# 23. POSTURE DIRECTION

The system classifies the dominant deviation into:

``` text
forward
backward
left
right
neutral
```

The dominant axis is determined by comparing pitch and roll deviations.

If:

``` text
pitchDeviation >= rollDeviation
```

then pitch determines direction.

For pitch:

``` text
positive → forward
negative → backward
```

Otherwise roll determines direction:

``` text
positive → right
negative → left
```

The exact sign interpretation depends on the established sensor/body
mapping and must remain consistent.

------------------------------------------------------------------------

# 24. CORRECTION RESPONSE

File:

``` text
processing/correctionResponse.ts
```

Current response states:

``` text
WAITING
OBSERVING
CORRECTED
```

There is no:

``` text
NO_CORRECTION
```

state.

There is no timeout-based correction failure state.

There is no additional confirmation delay.

------------------------------------------------------------------------

# 25. CORRECTION RESPONSE LOGIC

Once a feedback event occurs, the system observes whether the user
returns within the relevant personalized threshold.

For left/right correction:

``` text
rollOutside == false
```

indicates correction.

For forward/backward correction:

``` text
pitchOutside == false
```

indicates correction.

An unrelated axis may remain outside its threshold without invalidating
correction of the dominant alerted axis.

This is important because the system is evaluating correction of the
specific posture deviation that generated the alert.

------------------------------------------------------------------------

# 26. CORRECTION RESPONSE DATA

A correction response stores:

``` text
feedbackTimestamp
correctionTimestamp
initialDeviation
finalDeviation
responseTime
direction
```

The response time is the elapsed time between feedback and detected
correction.

Observation cannot restart while already observing the same correction
event.

------------------------------------------------------------------------

# 27. SESSION DATA MODEL

File:

``` text
processing/sessionRecorder.ts
```

A session contains:

``` text
id
startTime
endTime
monitoredDuration
calibration
samples
feedbackEvents
correctionResponses
sampleCount
actualSamplingRate
```

------------------------------------------------------------------------

# 28. POSTURE SAMPLE

Each posture sample contains:

``` text
timestamp
pitch
roll
pitchDeviation
rollDeviation
overallDeviation
postureAcceptable
direction
pitchThreshold
rollThreshold
```

Important implementation note:

The current `overallDeviation` field in the stored posture sample
represents the maximum of the pitch/roll deviations in the current
implementation, even though the name can sound like a Boolean state.

Do not silently change this data model without considering downstream
metrics and historical data compatibility.

------------------------------------------------------------------------

# 29. FEEDBACK EVENT

Each feedback event contains:

``` text
timestamp
deviation
direction
```

------------------------------------------------------------------------

# 30. CORRECTION RESPONSE RECORD

Each completed correction response contains:

``` text
feedbackTimestamp
correctionTimestamp
initialDeviation
finalDeviation
responseTime
direction
```

------------------------------------------------------------------------

# 31. PERFORMANCE METRICS

File:

``` text
processing/performanceMetrics.ts
```

Current metrics include:

``` text
consistency
averageCorrectionTime
feedbackEvents
timeInGoodPosture
longestContinuousGoodPosture
postureSpecific
deviationHistory
completedCorrections
completionRate
directionCorrectionTimes
actualSamplingRate
monitoredDuration
sampleCount
```

------------------------------------------------------------------------

# 32. CONSISTENCY METRIC

Current formula:

``` text
Consistency =
goodPostureTime / monitoredDuration × 100
```

It represents the percentage of monitored time spent in acceptable
posture.

Example:

``` text
Good posture time = 492 seconds
Monitored time = 600 seconds

Consistency =
492 / 600 × 100
= 82%
```

------------------------------------------------------------------------

# 33. COMPLETION RATE

Current formula:

``` text
Completion Rate =
completedCorrections / feedbackEvents × 100
```

This should be interpreted carefully.

It represents completed correction responses relative to feedback events
during the session.

It is not a perfect standalone measure of user success because a session
may end while a correction is still being observed.

------------------------------------------------------------------------

# 34. DIRECTION-SPECIFIC CORRECTION TIMES

The system can calculate average correction response time separately
for:

``` text
forward
backward
left
right
```

This allows historical analysis of whether some posture directions take
longer for the user to correct.

------------------------------------------------------------------------

# 35. SAMPLING-RATE METRIC

The system records:

``` text
actualSamplingRate
```

rather than assuming the configured target of 50 Hz was achieved.

This is useful because:

-   mobile operating systems can throttle callbacks
-   device load can vary
-   sensor callbacks are not guaranteed to arrive exactly on schedule

The actual rate therefore provides an engineering diagnostic for session
quality.

------------------------------------------------------------------------

# 36. MONITORING LIFECYCLE

The application uses:

``` ts
monitoringActive = useRef(false)
```

This separates:

``` text
IMU service running
```

from:

``` text
posture monitoring session active
```

This distinction is intentional.

The IMU subscription can remain active while actual posture processing
is disabled.

------------------------------------------------------------------------

# 37. SESSION START

When calibration succeeds:

1.  A session is created.
2.  `monitoringActive.current` becomes `true`.
3.  Incoming IMU samples are processed.
4.  Orientation is estimated.
5.  Personalized deviation is evaluated.
6.  Stability and persistence are evaluated.
7.  Feedback is generated when required.
8.  Correction responses are tracked.
9.  Session samples/events are recorded.

The core processing condition is conceptually:

``` ts
if (
  monitoringActive.current &&
  currentCalibration !== null &&
  currentCalibration.valid
) {
    // process posture
}
```

------------------------------------------------------------------------

# 38. STOP MONITORING

When the user stops monitoring:

1.  `monitoringActive.current = false`
2.  Any active vibration is stopped.
3.  Correction observation is reset.
4.  The current session is ended exactly once.
5.  Final metrics are calculated.
6.  The finalized session and metrics remain available in local state.
7.  The completed session is uploaded asynchronously.
8.  Real-time detectors/controllers are reset.

`stopMonitoring()` is guarded by `monitoringActive.current`. The first
valid stop sets that ref to `false` synchronously, and the Stop Monitoring
control is then hidden. Repeated presses therefore cannot finalize,
calculate metrics for, or upload the same session twice.

The upload lifecycle is outside the real-time IMU processing loop:

``` text
Finalize session
→ calculate and display metrics
→ retain finalized session and metrics
→ upload asynchronously
→ terminal persistence outcome
```

Upload outcomes are:

``` text
2xx
→ saved
→ clear pending upload references
→ request Historical Analytics refresh

409 duplicate session ID
→ possibly-saved
→ the session may already exist on the backend
→ clear pending upload references
→ request Historical Analytics refresh

ordinary failure
→ failed
→ retain the exact finalized session and metrics in memory
→ expose Retry Upload
→ do not refresh Historical Analytics

timeout
→ failed
→ retain the exact finalized session and metrics in memory
→ expose Retry Upload
→ do not retry automatically
```

The upload-state model is:

``` text
idle
uploading
saved
failed
possibly-saved
```

`idle` means no completed-session upload is currently pending.
`uploading` means a finalized session is currently being sent. `saved`
means the backend confirmed successful persistence. `failed` means the
upload failed or timed out, while the finalized session and metrics
remain available for manual retry during the current application
lifetime. `possibly-saved` means the backend returned HTTP `409`; it is a
terminal persistence outcome because the ID already exists, but it is not
described as confirmed persistence.

Retry Upload reuses the exact finalized session, session ID, and metrics.
It does not recalculate metrics, create another session, generate another
ID, or retry automatically. A synchronous upload guard prevents
overlapping requests, including rapid repeated Retry presses.

------------------------------------------------------------------------

# 39. WHY THE IMU SERVICE CAN REMAIN RUNNING AFTER STOP

Stopping monitoring does not necessarily mean the underlying sensor
subscription must be destroyed.

The architecture intentionally separates:

``` text
Sensor stream
```

from:

``` text
Monitoring session
```

Therefore:

``` text
IMU service active
+
monitoringActive = false
=
sensor data may exist, but posture/session processing is disabled
```

This is acceptable for the current prototype.

It also allows monitoring to be started again without reconstructing the
entire sensor pipeline.

------------------------------------------------------------------------

# 40. BACKEND ARCHITECTURE

Backend technology:

``` text
Node.js
Express 5.2.1
TypeScript 5.9.3
SQLite
better-sqlite3
cors
ts-node-dev
```

The backend runs on:

``` text
port 3000
```

and is bound to:

``` text
0.0.0.0
```

This allows the Android phone to connect to the Mac over the local
network.

------------------------------------------------------------------------

# 41. BACKEND SERVER

File:

``` text
backend/src/server.ts
```

Responsibilities:

-   create Express server
-   enable CORS
-   parse JSON with `express.json({ limit: '50mb' })`
-   mount session and historical-metrics routes
-   listen on port 3000

`app` and `startServer()` are exported so the backend can be exercised
by the regression tests without launching a separate production
process. Historical analytics remains outside the real-time posture
processing loop.

Expected startup message:

``` text
PJT-I backend running on port 3000
```

------------------------------------------------------------------------

# 42. DATABASE

File:

``` text
backend/src/database.ts
```

Database:

``` text
SQLite
```

File:

``` text
backend/posture.db
```

The production path is resolved from `__dirname`, rather than the
process working directory, so launching the backend from different
directories still targets `backend/posture.db`. Tests override this path
through `PJT_I_DATABASE_PATH` and use an isolated temporary database.

The runtime database and its SQLite sidecar files are ignored by Git.

SQLite is configured with WAL mode.

The current database contains a sessions table with fields:

``` text
id
start_time
end_time
monitored_duration
sample_count
actual_sampling_rate
session_data
```

The complete session object is currently stored as JSON inside:

``` text
session_data
```

This is a deliberate first-stage persistence design.

It keeps implementation simple while the data model is still evolving.

------------------------------------------------------------------------

# 43. SESSION API

File:

``` text
backend/src/routes/sessions.ts
```

Current endpoints:

``` http
GET /
POST /api/sessions
GET /api/sessions
GET /api/sessions/:id
GET /api/metrics/summary
GET /api/metrics/trends
```

------------------------------------------------------------------------

## POST /api/sessions

Used to upload a completed session from the mobile application.

The completed session and calculated metrics are sent to the backend.

The endpoint validates the complete current session-upload structure at
runtime. Validation includes:

-   required session, calibration, sample, feedback, correction, and
    metric fields
-   finite and non-negative numeric requirements where applicable
-   integer counts
-   posture-direction values
-   nullable correction-time fields
-   deviation-history entries
-   consistency between session counts, arrays, and metric counts

Malformed payloads return HTTP `400` with validation details. Duplicate
session IDs return HTTP `409`. Payloads are rejected rather than silently
repaired or transformed.

------------------------------------------------------------------------

## GET /api/sessions

Returns stored sessions.

Used for:

-   debugging
-   historical retrieval
-   direct inspection of persisted session summaries

------------------------------------------------------------------------

## GET /api/sessions/:id

Returns one stored session by ID.

`GET /api/metrics/summary` and `GET /api/metrics/trends` expose the
implemented historical analytics described later in this document.

------------------------------------------------------------------------

# 44. FRONTEND API SERVICE

File:

``` text
services/apiService.ts
```

The frontend uploads completed sessions asynchronously and retrieves
historical analytics through the same service.

Completed sessions are sent using `POST /api/sessions` with the existing
session fields plus the calculated `metrics` object. Non-successful HTTP
responses produce a typed `SessionUploadError` that preserves the HTTP
status, allowing HTTP `409` to be distinguished from other failures.

Session upload uses one 30-second `AbortController` timeout covering the
complete operation:

``` text
fetch
→ response body reading
→ status interpretation
→ JSON parsing
→ completion
```

The timer is cleared in `finally` after the operation completes, including
success, HTTP failure, network failure, body/JSON failure, or timeout.
Timeout errors use `status: null`; HTTP failures retain their actual
status. A timeout does not prove that the backend failed to receive or
persist the request, which is why a later retry may receive HTTP `409`.

The API base URL is supplied in the root-level, Git-ignored
`.env.local` file:

``` text
EXPO_PUBLIC_API_BASE_URL=http://<local-backend-host>:3000
```

Expo SDK 57 exposes `EXPO_PUBLIC_*` variables to application code.
`services/apiService.ts` reads
`process.env.EXPO_PUBLIC_API_BASE_URL` and fails clearly when it is not
configured. Changing the development LAN address therefore does not
require editing application logic. The value is development
configuration, not a secret, but local addresses and environment files
must not be committed.

------------------------------------------------------------------------

# 45. NETWORK REQUIREMENTS

For the Android Expo application to communicate with the local Node.js
server:

``` text
Android phone
      ↓
same reachable network
      ↓
Mac
      ↓
Node.js :3000
```

The phone must be able to reach the Mac's LAN IP.

`localhost` from the Android phone refers to the phone itself, not the
Mac.

Therefore this does not work for the phone:

``` text
http://localhost:3000
```

The phone needs the Mac's LAN address:

``` text
http://<MAC-LAN-IP>:3000
```

------------------------------------------------------------------------

# 46. NETWORK CONFIGURATION AND DEBUGGING

The development host's current LAN address can be checked using:

``` bash
ifconfig | grep "inet "
```

After updating `.env.local`, Expo must reload the environment value.

The backend responded correctly to requests from the Android prototype.

------------------------------------------------------------------------

# 47. END-TO-END VALIDATION

The following has already been verified:

``` text
Android Expo App
        ↓
Posture monitoring
        ↓
Session creation
        ↓
Session completion
        ↓
API upload
        ↓
Node.js backend
        ↓
SQLite
```

The backend also returned:

``` json
{
  "message": "PJT-I Posture Backend is running"
}
```

POST/GET session tests worked.

A real posture-monitoring session was successfully uploaded.

The real session was visible through the backend/API.

Therefore the current persistence architecture is operational.

Current repository validation established during the implemented
checkpoints includes:

-   frontend TypeScript validation with `npx tsc --noEmit`
-   Expo SDK 57 public-configuration validation
-   Expo Android bundle export validation
-   backend TypeScript compilation
-   the backend regression suite
-   direct backend endpoint and SQLite-persistence verification
-   `git diff --check` before checkpoint commits

These are engineering/software validations. They are not clinical
validation, medical efficacy evidence, hardware validation, or a
large-scale user study.

------------------------------------------------------------------------

# 48. TYPESCRIPT TOOLCHAIN ISSUE THAT WAS RESOLVED

The backend initially had:

``` text
Node v26.9.0
TypeScript 7.0.2
ts-node 10.9.2
ts-node-dev 2.0.0
```

This caused:

``` text
TypeError:
Cannot read properties of undefined (reading 'fileExists')
```

The issue was caused by incompatibility between the TypeScript version
and the existing ts-node tooling.

The working toolchain was installed using:

``` bash
npm uninstall typescript ts-node ts-node-dev

npm install -D \
  typescript@5.9.3 \
  ts-node@10.9.2 \
  ts-node-dev@2.0.0
```

The backend then ran successfully.

------------------------------------------------------------------------

# 49. CURRENT APP.TSX STATE

The current `App.tsx` includes:

``` text
real-time IMU processing
orientation estimation
calibration
deviation detection
stability detection
persistence detection
feedback
haptic control
correction response
session recording
performance metrics
backend upload
monitoringActive lifecycle
historical analytics state and UI
startup/manual/post-upload analytics loading
coalesced trailing-refresh coordination
```

It imports session upload and historical analytics functions/types from:

``` ts
services/apiService.ts
```

The current stop-monitoring lifecycle has been corrected to avoid
duplicate session-ending logic.

An earlier erroneous block contained an undefined:

``` text
sessionRecorder
```

reference.

That was removed/replaced with the established session reference and
`endSession(...)` flow.

Historical analytics is rendered after completed-session Performance
Metrics and before calibration controls. It is hidden during calibration
and active monitoring so it remains supplementary to the real-time
workflow.

------------------------------------------------------------------------

## Backend regression tests

The backend regression suite uses Node's built-in `node:test` facilities
with `ts-node/register`; no large testing framework was introduced. The
suite starts the exported Express application on an ephemeral port and
uses a temporary SQLite database selected through
`PJT_I_DATABASE_PATH`. Cleanup closes the server/database and removes
the temporary directory, so tests do not modify `backend/posture.db`.

Coverage includes:

-   health endpoint
-   valid session POST
-   session collection and detail GET
-   missing-session `404`
-   malformed-payload `400`
-   non-finite numeric rejection
-   duplicate-ID `409`
-   realistically sized payload acceptance
-   isolated SQLite persistence
-   empty historical analytics
-   single-session and multi-session aggregation
-   chronological trend shape and field exclusion
-   incompatible legacy-session exclusion/counting
-   analytics database-failure responses

------------------------------------------------------------------------

# 50. IMPORTANT IMPLEMENTATION CONSTRAINTS

Do not break the validated real-time posture algorithm while adding
analytics/backend functionality.

The following current behavior should be treated as frozen unless
explicitly requested:

``` text
Complementary filter alpha = 0.98
Calibration duration = 30 sec
Minimum calibration samples = 100
Calibration std validity ≈ 4°
Minimum deviation threshold = 4°
Variability factor = 2
Stability window = 2 sec
Stability std limit = 2°
Minimum stability samples = 10
Persistence = 3 sec
Continuous vibration until correction
No feedback cooldown
Correction states = WAITING / OBSERVING / CORRECTED
```

------------------------------------------------------------------------

# 51. IMPORTANT TERMINOLOGY

Use these terms consistently.

### Calibration

Establishes the user's natural baseline and natural variability.

### Baseline

The personalized reference posture calculated during calibration.

### Deviation

The difference between current posture and the personalized baseline.

### Stability

Whether posture measurements remain sufficiently consistent over the
stability window.

### Persistence

How long the deviation remains present while the posture is stable.

### Feedback

The action taken after the deviation survives the required detection
conditions.

### Correction response

The measured return toward the acceptable personalized posture after
feedback.

### Consistency

The percentage of monitored time spent in acceptable posture.

### Completion rate

The percentage of feedback events that result in a recorded completed
correction response.

------------------------------------------------------------------------

# 52. WHY MULTIPLE FILTERING/STABILITY LAYERS EXIST

The system does not simply say:

``` text
angle > threshold → vibrate
```

because real human movement contains natural fluctuations.

Instead:

``` text
Raw IMU
  ↓
Complementary filter
  ↓
Personalized baseline
  ↓
Personalized threshold
  ↓
Stability check
  ↓
Persistence requirement
  ↓
Feedback
```

Each stage addresses a different issue:

``` text
Complementary filter
→ sensor fusion / orientation smoothing

Personalized threshold
→ individual differences

Stability
→ reject rapidly changing motion

Persistence
→ reject short-lived deviations
```

This layered approach is central to the project's noise-suppression
strategy.

------------------------------------------------------------------------

# 53. KNOWN LIMITATIONS

The current prototype has several known limitations.

## Smartphone instead of final wearable hardware

The current system validates the software algorithm but does not yet
validate the physical MPU6050 + ESP32 belt.

------------------------------------------------------------------------

## Mobile sensor callback variability

The target is approximately 50 Hz, but the actual sampling rate can
vary.

The system records actual sampling rate for diagnostics.

------------------------------------------------------------------------

## Complementary filter limitations

The complementary filter is intentionally lightweight and appropriate
for the prototype.

It does not replace more advanced sensor-fusion methods such as a Kalman
filter.

The project does not currently require a more complex filter.

------------------------------------------------------------------------

## Calibration dependence

The quality of personalization depends on the quality of the calibration
posture.

If the user calibrates while intentionally adopting an abnormal posture,
the baseline can be inappropriate.

------------------------------------------------------------------------

## Thresholds are engineering parameters

The values:

``` text
4°
2°
3 sec
2 sec
```

are current engineering choices for the prototype.

They should not be presented as clinically validated medical thresholds.

------------------------------------------------------------------------

## Backend dependency

The backend is used for persistence and analytics.

The real-time posture feedback loop should continue to operate locally
even if the backend is temporarily unreachable.

------------------------------------------------------------------------

## In-memory upload recovery only

Manual Retry Upload is implemented, but failed or pending
completed-session data is retained only in application memory. If the
application is terminated before persistence succeeds or a retry
completes, the pending upload data is not guaranteed to survive.

The current implementation has:

-   no durable offline upload queue
-   no filesystem or SQLite pending-upload queue
-   no AsyncStorage-based upload queue
-   no background retry service

Manual in-memory retry must therefore not be described as durable offline
synchronization.

------------------------------------------------------------------------

## Historical analytics frontend limitations

The current frontend intentionally has:

-   no charts or charting dependency
-   no date-range filters
-   no pagination
-   no analytics polling
-   no cloud analytics
-   no authentication or multi-user separation
-   no frontend historical-analytics unit-test framework

Historical trend rows are mapped as ordinary views inside the existing
`ScrollView`. This is appropriate for the currently expected modest
dataset, but very large histories may eventually require pagination or
rendering optimization.

------------------------------------------------------------------------

# 54. CURRENT DEVELOPMENT STATUS

## Completed

### Real-time posture pipeline

Completed:

``` text
IMU input
→ orientation
→ complementary filter
→ body mapping
→ calibration
→ deviation
→ stability
→ persistence
→ feedback
```

### Correction tracking

Completed:

``` text
feedback
→ observation
→ corrected
→ response time
```

### Session recording

Completed.

### Performance metrics

Completed.

### Backend

Completed.

### SQLite persistence

Completed.

### Mobile-to-backend communication

Completed.

### Real session upload

Verified.

### Completed-session upload reliability

Implemented with visible upload state, failed-upload recovery during the
current application lifetime, manual same-session retry, HTTP `409`
possibly-saved handling, a bounded 30-second upload timeout, concurrent
upload prevention, recalibration protection while persistence is
unresolved, duplicate Stop Monitoring protection, and Historical
Analytics refresh after successful persistence or HTTP `409`.

Durable offline synchronization is not implemented.

### Persistence hardening

Implemented: larger realistic-session request limit, full runtime
payload validation, non-finite numeric rejection, explicit duplicate-ID
handling, and stable production database path resolution.

### Backend regression tests

Implemented with an isolated temporary SQLite database.

### Historical analytics backend

Implemented with summary and chronological trend endpoints derived from
persisted compatible sessions.

### Historical analytics frontend

Implemented with startup loading, manual refresh, post-upload refresh,
loading/error/empty states, and single-request/trailing-refresh
coordination.

------------------------------------------------------------------------

# 55. NEXT IMPLEMENTATION ROADMAP

The next development stages are:

``` text
1. Adaptive-system experimental evaluation
2. Final Hardware Integration
3. Hardware-specific haptic calibration
4. Production-hardening work if required
```

Historical analytics, behavioral-EMA adaptive thresholds, and adaptive
feedback persistence are implemented. Variable vibration intensity and
physical-belt integration remain future work.

------------------------------------------------------------------------

# 56. HISTORICAL ANALYTICS --- IMPLEMENTED

Historical analytics is implemented through:

``` http
GET /api/metrics/summary
GET /api/metrics/trends
```

Files:

``` text
backend/src/analytics.ts
backend/src/routes/metrics.ts
backend/src/server.ts
services/apiService.ts
App.tsx
```

Analytics is calculated from persisted compatible sessions. Legacy or
incompatible rows are excluded from calculations and counted. The
analytics backend is not part of the real-time IMU-to-feedback loop.

------------------------------------------------------------------------

# 57. HISTORICAL SUMMARY

`GET /api/metrics/summary` returns:

``` text
totalSessions
includedSessions
excludedSessions
totalMonitoredDuration
averageConsistency
averageCorrectionTime
totalFeedbackEvents
totalCompletedCorrections
overallCompletionRate
averageSamplingRate
```

Historical consistency is duration-weighted:

``` text
sum(timeInGoodPosture) / sum(monitoredDuration) × 100
```

Historical sampling rate is aggregate:

``` text
sum(sampleCount) / (sum(monitoredDuration) / 1000)
```

Average correction time is calculated across the individual completed
correction-response times, not by averaging session averages. Overall
completion rate is total completed corrections divided by total
feedback events.

The backend does not calculate historical mean deviation, maximum
deviation, deviation percentiles, normalized deviation scores, or other
invented aggregate deviation metrics.

------------------------------------------------------------------------

# 58. HISTORICAL TRENDS

`GET /api/metrics/trends` returns compatible sessions ordered by
`startTime` ascending. Each trend record contains:

``` text
id
startTime
endTime
monitoredDuration
sampleCount
actualSamplingRate
consistency
averageCorrectionTime
feedbackEvents
completedCorrections
completionRate
timeInGoodPosture
longestContinuousGoodPosture
postureSpecific
directionCorrectionTimes
```

The endpoint deliberately omits raw posture samples, calibration data,
deviation history, and correction-response arrays.

------------------------------------------------------------------------

# 59. HISTORICAL ANALYTICS UI

Historical Analytics is implemented in `App.tsx`, using typed API
functions from `services/apiService.ts`.

The frontend provides:

``` text
startup summary/trend loading
manual refresh
refresh after successful session upload or HTTP 409
loading and refreshing states
error state
empty state
historical summary
chronological per-session trend rows
```

The section appears after completed-session Performance Metrics and
before calibration controls. It is hidden while calibration or active
monitoring is running and becomes visible again when monitoring is
inactive.

The summary displays the implemented backend summary fields, including
included/excluded counts. Trend rows display date/time, monitored
duration, consistency, average correction time, feedback events,
completed corrections, completion rate, and sampling rate. Nullable
averages display `N/A`; no placeholder or invented values are created.

### Loading and refresh lifecycle

``` text
App startup
→ fetch summary and trends concurrently

Session completion
→ finalize session
→ calculate metrics
→ upload completed session
→ upload succeeds or returns HTTP 409
→ refresh summary and trends
```

Ordinary HTTP failure, network failure, timeout, and response parsing
failure do not trigger the post-upload analytics refresh. An analytics
failure preserves previously loaded data, displays an error, and does not
affect calibration, monitoring, feedback, correction response, session
finalization, or upload. Upload success remains a successful persistence
outcome even if the subsequent analytics refresh fails.

### Request coordination

Only one analytics load is active at a time. If another refresh is
requested while a load is active, a Boolean pending flag records one
coalesced trailing refresh. Multiple triggers do not create multiple
queued requests. When the active request finishes—even if it fails—the
pending flag is cleared before exactly one trailing load begins.

This prevents a successful session upload from silently losing its
analytics refresh when another load is already running. The mechanism
does not form a generic queue or background worker, does not poll, and
does not recursively refresh without an external trigger. Pending work
is cleared on component unmount.

------------------------------------------------------------------------

# 60. ADAPTIVE FEEDBACK — PHASE 2

File:

``` text
processing/adaptiveFeedback.ts
```

Adaptive feedback Phase 1 uses only completed correction-response times
from the current monitoring session. It does not use incomplete
corrections, unmatched feedback events, calibration duration, raw sensor
noise, backend analytics, or clock time by itself.

Axis-specific adaptive deviation thresholds are now implemented as a
separate tolerance mechanism that answers whether feedback should be
triggered. Adaptive feedback observes how recent completed corrections
behaved after feedback was triggered. It cannot modify calibration,
thresholds, stability, persistence, or correction completion semantics.

The controller retains at most the five most recent completed response
times. Individual response times are classified as:

``` text
responseTime < 3 seconds       → FAST
3 seconds ≤ responseTime ≤ 6  → NORMAL
responseTime > 6 seconds       → SLOW
```

The current mode is selected deterministically:

``` text
NORMAL
→ fewer than 3 usable responses, or no consistent slow pattern

PERSISTENT
→ at least 3 usable responses and at least 2 of the latest 3 are slow

HIGH_PERSISTENCE
→ at least 5 usable responses and at least 4 of the latest 5 are slow
```

Mode state is exposed through the feedback layer. It resets when a new
monitoring session starts, monitoring stops, recalibration starts, or
the component is cleaned up. It is bounded in memory and is not added to
the persisted session or backend schema.

Phase 2 makes the modes behaviorally distinct through safe reassertion
of the existing continuous-vibration command:

``` text
NORMAL
→ start the existing continuous vibration once
→ no reassertion timer

PERSISTENT
→ start the existing continuous vibration
→ reassert the same command every 6 seconds while monitoring and
  correction observation both remain active

HIGH_PERSISTENCE
→ start the existing continuous vibration
→ reassert the same command every 3 seconds while monitoring and
  correction observation both remain active
```

The 6-second and 3-second reassertion intervals reuse the existing slow-
and fast-response boundaries. Reassertion does not trigger feedback by
itself: the ordinary stability and persistence path must first produce a
real feedback event. It improves command continuity if the platform
interrupts a repeating vibration, but it does not change the correction
condition or create another feedback event.

Correction remains authoritative. Confirmed correction stops the timer
and cancels vibration. Monitoring stop, recalibration, new-session start,
and component cleanup also clear the timer. A timer callback verifies
that monitoring and correction observation are still active before
reasserting, so it cannot restart feedback after correction.

All modes still use the haptic service's existing `[0, 200, 100]`
repeating pattern. React Native exposes repeat-pattern timing but this
implementation does not add amplitude control. Vibration amplitude and
intensity are not adaptive.

Slow response is interpreted only as recent correction-response
behavior. The system does not detect or claim to detect physiological
fatigue.

The Phase 2 controller is deterministic and local to the active session.
Backend history remains outside the real-time feedback loop.

Possible future adaptation dimensions, once supported by evidence and
implementation, include:

``` text
feedback sensitivity
persistence duration
feedback intensity/pattern
direction-specific behavior
user-specific tolerance
```

Adaptation should be data-driven and constrained.

It must not blindly redefine the user's posture baseline.

------------------------------------------------------------------------

# 61. ADAPTATION PRINCIPLE

The system should distinguish between:

``` text
Baseline personalization
```

and:

``` text
Feedback adaptation
```

Calibration establishes:

``` text
What is normal for this user?
```

Historical adaptation can later study:

``` text
How does this user respond to feedback?
```

These are different concepts and should remain separate.

------------------------------------------------------------------------

# 62. FINAL HARDWARE INTEGRATION --- FUTURE STAGE

After the software pipeline is sufficiently validated, the smartphone
IMU should be replaced by:

``` text
MPU6050
   ↓
ESP32
   ↓
wireless communication
   ↓
mobile/application layer
```

The vibration output should eventually move from phone vibration to the
physical vibration motor.

The existing processing architecture should be preserved where possible.

## Hardware-level adaptive vibration intensity

Variable vibration intensity is a future physical-belt requirement, not
a capability of the current React Native phone-vibration prototype. The
existing adaptive feedback controller must remain the decision layer
during hardware migration. Its `NORMAL`, `PERSISTENT`, and
`HIGH_PERSISTENCE` modes should eventually map to distinguishable
physical haptic output levels while preserving the existing threshold,
stability, persistence, and correction-response stages.

The physical haptic path should be evaluated as:

``` text
MCU
  ↓
haptic driver / suitable motor driver
  ↓
vibration actuator
```

The actuator and driver must be selected together based on whether they
support controllable drive amplitude. A suitable eccentric rotating mass
(`ERM`) or linear resonant actuator (`LRA`) with an appropriate driver is
a candidate implementation. The final choice depends on the MCU,
actuator, driver, available power, wearable mounting, and measured belt
behavior.

Low, medium, and high physical intensity values must be experimentally
calibrated on the completed belt. Those values must not be hardcoded in
the phone prototype or specified before the actuator, driver, MCU, power
requirements, and mounting arrangement have been selected and tested.

The hardware implementation must retain the current safety rules:

``` text
confirmed correction → stop feedback
monitoring stop      → stop feedback
recalibration        → stop and reset feedback
```

Adaptive feedback must never continue indefinitely after confirmed
correction. Hardware intensity control must not bypass the existing
feedback eligibility, correction, or lifecycle stop logic.

Current and future status must be represented explicitly:

``` text
CURRENT SOFTWARE PROTOTYPE
Adaptive threshold                         IMPLEMENTED
Adaptive feedback controller               IMPLEMENTED
Adaptive feedback persistence/reassertion  IMPLEMENTED
Variable vibration intensity               NOT IMPLEMENTED
Physiological fatigue detection             NOT IMPLEMENTED

FUTURE PHYSICAL BELT
Adaptive threshold                         RETAIN
Adaptive feedback controller               RETAIN
Adaptive feedback persistence              RETAIN
Variable haptic intensity                  IMPLEMENT
Hardware-specific intensity calibration    REQUIRED
```

Therefore the current prototype must not be described as providing
adaptive vibration amplitude or intensity. Its implemented adaptive
feedback behavior is persistence/reassertion based on recent completed
correction responses. This behavior does not constitute physiological
fatigue detection.

------------------------------------------------------------------------

# 63. EXPERIMENTAL EVALUATION --- FUTURE STAGE

The final evaluation should examine engineering performance using
measurable metrics.

Possible measured quantities supported by the current architecture
include:

``` text
sampling rate
consistency
correction response time
completion rate
feedback frequency
direction-specific correction time
session duration
```

The evaluation should distinguish:

``` text
system performance
```

from:

``` text
clinical/medical claims
```

The current project is an engineering/research prototype, not a
clinically validated medical device.

------------------------------------------------------------------------

# 64. RESEARCH CONTRIBUTION

The strongest contribution of the current project is the personalized
processing pipeline:

``` text
Personal baseline
+
Personal variability
+
Stability
+
Persistence
+
Correction tracking
+
Historical metrics
+
Future adaptation
```

The project is therefore not simply:

``` text
IMU detects angle
→ vibration
```

Instead it attempts to create a personalized closed-loop posture
correction system.

------------------------------------------------------------------------

# 65. IMPORTANT ARCHITECTURAL PRINCIPLE

The real-time feedback loop should remain local:

``` text
IMU
↓
orientation
↓
deviation
↓
stability
↓
persistence
↓
feedback
```

Do not make this depend on:

``` text
network request
database query
backend response
```

because latency or connectivity failure could interfere with feedback.

The backend should primarily support:

``` text
persistence
historical analytics
future adaptation
```

------------------------------------------------------------------------

# 66. DATA FLOW

Current completed data flow:

``` text
Phone IMU
    ↓
imuService
    ↓
orientation.ts
    ↓
calibration.ts
    ↓
deviation.ts
    ↓
stability.ts
    ↓
persistence.ts
    ↓
feedback.ts
    ↓
hapticService
    ↓
correctionResponse.ts
    ↓
sessionRecorder.ts
    ↓
performanceMetrics.ts
    ↓
apiService.ts
    ↓
HTTP
    ↓
Express backend
    ↓
SQLite
    ↓
Historical analytics aggregation
    ↓
GET /api/metrics/summary + /trends
    ↓
Frontend Historical Analytics UI
```

The IMU-to-feedback portion remains local and real-time. Session upload
and historical retrieval are asynchronous data flows and do not decide
real-time feedback.

------------------------------------------------------------------------

# 67. DEBUGGING PRINCIPLES

When modifying the project:

1.  Preserve working functionality.
2.  Change one subsystem at a time.
3.  Prefer complete replacement files when making substantial file-level
    changes.
4.  Test TypeScript compilation after major changes.
5.  Run the backend independently.
6.  Verify API endpoints independently.
7.  Test the Expo application separately.
8.  Test the complete end-to-end session upload.
9.  Do not confuse sensor-stream status with monitoring-session status.
10. Do not put backend calls inside the real-time posture detection
    loop.

------------------------------------------------------------------------

# 68. IMPORTANT CURRENT NETWORK NOTE

The development LAN address is intentionally not hard-coded in source or
in this document. It is supplied through:

``` text
.env.local
EXPO_PUBLIC_API_BASE_URL=http://<local-backend-host>:3000
```

If backend upload fails with a connection error such as:

``` text
java.net.ConnectException
```

first check:

``` bash
ifconfig | grep "inet "
```

Then update `.env.local` with the reachable development host and reload
Expo. Do not edit `services/apiService.ts` or commit the environment
file.

Also confirm that:

-   backend is running
-   port 3000 is reachable
-   phone and Mac are on a reachable network
-   the backend is bound to `0.0.0.0`

------------------------------------------------------------------------

# 69. DO NOT ADD UNIMPLEMENTED FEATURES TO REPORTS

For project reports, presentations, demonstrations, or evaluations:

Only describe a feature as implemented if it actually exists in the
current codebase.

Examples:

### Implemented

``` text
Real-time posture monitoring
Complementary filtering
Personalized calibration
Personalized deviation thresholds
Adaptive deviation thresholds
Adaptive-feedback response-history mode controller
Adaptive-feedback persistence reassertion
Stability detection
Persistence detection
Haptic feedback
Correction response tracking
Session recording
Performance metrics
Node.js backend
SQLite persistence
Real session upload
Hardened session persistence
Backend regression tests
Historical analytics backend
Historical analytics frontend
Analytics refresh race protection
Visible completed-session upload status
Manual in-memory Retry Upload
Same-session upload retry identity
HTTP 409 possibly-saved handling
30-second completed-session upload timeout
Upload concurrency and recalibration protection
```

### Not yet implemented / future

``` text
Adaptive vibration amplitude or intensity
ML-based posture classification
Final MPU6050 + ESP32 integration
Physical vibration motor
Cloud backend
Authentication and multi-user accounts
Durable offline upload queue
Pending-upload persistence across application termination
Background upload and retry
Broader offline synchronization
Advanced historical deviation analytics
Large-scale historical rendering optimization
Large-scale experimental evaluation
Clinical validation or medical claims
Production deployment
```

These future components should not be presented as completed.

------------------------------------------------------------------------

# 70. CURRENT PROJECT STATE SUMMARY

At the current stage:

``` text
                    PJT-I
                     │
        ┌────────────┴─────────────────────┐
        │                                  │
   REAL-TIME                          ASYNC DATA
   PIPELINE                           PIPELINE
        │                                  │
        ↓                                  ↓
     IMU input                     Completed Session
        ↓                                  ↓
 Orientation                            Metrics
        ↓                                  ↓
 Complementary Filter                    API
        ↓                                  ↓
 Personalization                       Backend
        ↓                                  ↓
 Adaptive Thresholds                    SQLite
        ↓                                  ↓
 Stability                   Historical Analytics
        ↓                                  ↓
 Persistence                  Metrics API + UI
        ↓
 Adaptive Feedback Mode
        ↓
 Feedback
        ↓
 Correction
```

The real-time processing pipeline is operational.

The session-local adaptive deviation threshold is operational. It does
not modify the canonical calibration baseline and does not use backend
analytics in the real-time path.

Adaptive Feedback Phase 2 is operational as a bounded, session-local
correction-response history and mode controller with mode-specific
continuous-vibration command reassertion. Correction and lifecycle stop
paths remain authoritative. Vibration amplitude and intensity are not
adaptive.

The session persistence pipeline is operational.

The historical analytics backend and frontend are operational. They are
fed by persisted completed sessions and remain separate from the
real-time feedback path.

------------------------------------------------------------------------

# 71. IMMEDIATE NEXT ACTION

Adaptive Feedback Phase 2 is implemented and ready for focused review.
Future hardware work may evaluate amplitude or motor-driving strategies;
vibration amplitude/intensity adaptation is not implemented.

------------------------------------------------------------------------

# 72. FINAL DEVELOPMENT RULE

Treat the current real-time posture algorithm as the stable foundation.

Any future feature should be layered around it rather than casually
rewriting it.

The intended long-term architecture is:

``` text
                ┌─────────────────────────────┐
                │     PERSONALIZED USER       │
                │        CALIBRATION          │
                └──────────────┬──────────────┘
                               ↓
IMU → Orientation → Deviation → Stability → Persistence
                               ↓
                           Feedback
                               ↓
                           Correction
                               ↓
                         Session Data
                               ↓
                           Metrics
                               ↓
                         Persistence
                               ↓
                    Historical Analytics
                               ↓
                       Adaptive Feedback
                               ↓
                    Improved Personalization
```

This architecture captures the central concept of PJT-I:

> A personalized, adaptive posture correction system that uses sensor
> fusion, individualized posture baselines, sustained-deviation
> detection, real-time haptic feedback, correction-response measurement,
> and historical performance data.
