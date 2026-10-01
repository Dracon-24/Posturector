# PJT-I — AGENTS.md

## 1. Project Identity

This repository contains **PJT-I — Personalized Adaptive Posture Correction Belt**.

The system is a low-cost wearable posture monitoring and correction system using an IMU sensor, a React Native/Expo frontend, real-time posture processing, haptic feedback, session recording, and a Node.js/Express/SQLite backend for persistence and historical analysis.

Before making changes, read:

```text
master_context.md
```

`master_context.md` is the primary project specification and source of truth for the current implementation.

---

## 2. Expo Version Requirement

# Expo HAS CHANGED

Read the exact versioned documentation at:

https://docs.expo.dev/versions/v57.0.0/

before writing or modifying Expo-related code.

Do not assume APIs from other Expo versions are compatible with this project.

---

## 3. Current Architecture

The current system consists of:

```text
React Native / Expo App
        │
        ├── IMU Service
        │
        ├── Orientation Estimation
        │
        ├── Complementary Filter
        │
        ├── Body/Sensor Mapping
        │
        ├── Personalized Calibration
        │
        ├── Personalized Deviation Detection
        │
        ├── Stability Detection
        │
        ├── Persistence Detection
        │
        ├── Feedback Controller
        │
        ├── Haptic Feedback
        │
        ├── Correction Response Tracking
        │
        ├── Performance Metrics
        │
        └── Session Persistence
                    │
                    ▼
             Backend API
                    │
                    ▼
             SQLite Database
```

The backend is **not part of the real-time posture-processing loop**.

The real-time path must remain:

```text
IMU
→ Orientation
→ Filtering
→ Calibration
→ Deviation
→ Stability
→ Persistence
→ Feedback
→ Correction Response
→ Metrics
```

Backend communication happens asynchronously for completed-session persistence and historical analysis.

---

## 4. Preserve the Validated Real-Time Algorithm

The following parameters and behaviors are currently validated and should not be changed casually.

### IMU

Target sampling:

```text
≈ 50 Hz
```

Current implementation uses:

```text
Accelerometer.setUpdateInterval(20)
Gyroscope.setUpdateInterval(20)
```

The accelerometer callback drives emitted samples while the latest gyroscope values are cached.

Actual sampling rate must continue to be measured and recorded.

---

## 5. Orientation Estimation

The orientation system uses a complementary filter.

Current filter parameter:

```text
ALPHA = 0.98
```

Accelerometer orientation:

```text
pitch = atan2(-ax, sqrt(ay² + az²))
roll  = atan2(ay, az)
```

Gyroscope integration:

```text
sensorPitch = previousPitch + gy * dt
sensorRoll  = previousRoll + gx * dt
```

with appropriate radians-to-degrees conversion.

The complementary filter combines:

```text
Gyroscope → short-term response
Accelerometer/gravity → long-term reference
```

Do not replace the complementary filter with another filtering technique unless explicitly requested.

---

## 6. Sensor/Body Mapping

Current mapping:

```text
BodyPitch = 90 - SensorRoll
BodyRoll  = SensorPitch
```

Do not change the mapping without verifying the physical sensor orientation and documenting the reason.

---

## 7. Calibration

Current prototype calibration duration:

```text
30 seconds
```

The intended engineering range is:

```text
30–60 seconds
```

Calibration calculates:

```text
pitchBaseline
rollBaseline
pitchStd
rollStd
confidence
sampleCount
duration
valid
```

Minimum calibration sample count:

```text
100 samples
```

Current engineering validity condition:

```text
pitchStd <= 4°
rollStd <= 4°
```

Calibration represents the user's natural comfortable upright posture.

Bad posture should not redefine the baseline.

These are engineering thresholds, not medical thresholds.

---

## 8. Personalized Deviation Detection

Current constants:

```text
MINIMUM_THRESHOLD = 4°
VARIABILITY_FACTOR = 2
```

Thresholds:

```text
pitchThreshold = 4° + 2 × pitchStd
rollThreshold  = 4° + 2 × rollStd
```

Deviation is calculated relative to the personalized calibration baseline.

Absolute deviation is used.

---

## 9. Noise Suppression

Noise suppression is intentionally layered:

```text
Raw Sensor Noise
        ↓
Complementary Filter
        ↓
Personalized Threshold
        ↓
Stability Detection
        ↓
Persistence Detection
        ↓
Feedback
```

Do not add arbitrary smoothing, averaging, cooldowns, or filters simply because pitch/roll values fluctuate.

Changes must preserve the distinction between:

```text
sensor noise
actual movement
sustained posture deviation
```

---

## 10. Stability Detection

Current stability window:

```text
2 seconds
```

Current limits:

```text
maximum pitch standard deviation = 2°
maximum roll standard deviation  = 2°
```

Minimum samples:

```text
10
```

A posture is stable when both pitch and roll variability remain within the configured limits.

---

## 11. Persistence Detection

Current persistence duration:

```text
3 seconds
```

Persistence accumulates only when:

```text
overallDeviation == true
AND
stability.stable == true
```

Transient instability resets persistence.

Do not trigger feedback immediately from a single noisy or unstable sample.

---

## 12. Feedback

The feedback controller is stateless.

There is intentionally **no feedback cooldown** in the current implementation.

Active correction behavior:

```text
Continuous vibration until correction
```

Do not introduce a cooldown unless explicitly requested.

---

## 13. Haptic Feedback

Current haptic behavior includes:

```text
vibrate(duration)
startContinuous()
stop()
```

Continuous vibration uses the current implementation in:

```text
services/hapticService.ts
```

Stopping feedback must cancel the active vibration.

Do not change the correction-feedback behavior without checking the existing implementation and `master_context.md`.

---

## 14. Posture Direction

Valid directions:

```text
forward
backward
left
right
neutral
```

Direction selection currently prioritizes the larger axis deviation.

If:

```text
pitch deviation >= roll deviation
```

pitch determines the direction.

Otherwise roll determines the direction.

Current interpretation:

```text
positive pitch → forward
negative pitch → backward

positive roll → right
negative roll → left
```

---

## 15. Correction Response Tracking

Current correction-response states:

```text
WAITING
OBSERVING
CORRECTED
```

Do not add a separate `NO_CORRECTION` state or timeout unless explicitly requested.

A correction is considered corrected when the relevant axis returns within its threshold.

For example:

```text
left/right → rollOutside becomes false
forward/backward → pitchOutside becomes false
```

The unrelated axis does not need to become normal for the correction to complete.

Tracked response data includes:

```text
feedbackTimestamp
correctionTimestamp
initialDeviation
finalDeviation
responseTime
direction
```

---

## 16. Session Recording

A session contains:

```text
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

Posture samples contain:

```text
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

Feedback events contain:

```text
timestamp
deviation
direction
```

Correction responses contain:

```text
feedbackTimestamp
correctionTimestamp
initialDeviation
finalDeviation
responseTime
direction
```

Preserve this data model unless a deliberate schema change is required.

---

## 17. Performance Metrics

Current metrics include:

```text
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

Consistency:

```text
goodPostureTime / monitoredDuration × 100
```

Completion rate:

```text
completedCorrections / feedbackEvents × 100
```

This represents completed correction responses relative to feedback events.

It must not automatically be described as a clinical or absolute measure of user success.

---

## 18. Monitoring Lifecycle

The IMU service running state and monitoring-session state are separate.

The application uses:

```text
monitoringActive
```

to distinguish whether posture processing should currently occur.

Posture processing should occur only when:

```text
monitoringActive == true
AND
calibration exists
AND
calibration.valid == true
```

Stopping monitoring must:

```text
monitoringActive = false
stop vibration
reset correction observation
end the session once
calculate metrics
upload the completed session asynchronously
reset persistence
reset stability
reset feedback controllers
```

The IMU subscription may remain active after monitoring is stopped. Do not assume that stopping monitoring means the sensor subscription must also be destroyed.

---

## 19. Backend

Backend stack:

```text
Node.js
Express
TypeScript
SQLite
better-sqlite3
CORS
```

Backend runs on:

```text
port 3000
```

and binds to:

```text
0.0.0.0
```

Current backend structure:

```text
backend/
├── package.json
├── package-lock.json
├── tsconfig.json
└── src/
    ├── database.ts
    ├── server.ts
    └── routes/
        └── sessions.ts
```

API endpoints:

```text
POST /api/sessions
GET  /api/sessions
GET  /api/sessions/:id
```

SQLite database:

```text
backend/posture.db
```

The database stores completed session information, including serialized session data.

Do not put database/network operations into the real-time IMU processing path.

---

## 20. Frontend/Backend Communication

Frontend API communication is handled by:

```text
services/apiService.ts
```

Completed sessions are uploaded asynchronously.

The backend should not block or determine real-time posture feedback.

The LAN IP used during development may change between networks. Never hard-code a development IP as a permanent architectural assumption.

---

## 21. Current Important Source Files

Before modifying behavior, inspect the relevant source file.

```text
App.tsx

services/
├── imuService.ts
├── hapticService.ts
└── apiService.ts

processing/
├── calibration.ts
├── correctionResponse.ts
├── deviation.ts
├── feedback.ts
├── orientation.ts
├── performanceMetrics.ts
├── persistence.ts
├── sessionRecorder.ts
└── stability.ts

backend/src/
├── database.ts
├── server.ts
└── routes/sessions.ts
```

Also inspect:

```text
master_context.md
models/postureModel.ts
```

before making changes that affect the data model or project architecture.

---

## 22. Implementation vs Planned Features

Do not represent planned functionality as implemented functionality.

Before adding or describing a feature, determine whether it is:

```text
IMPLEMENTED
PARTIALLY IMPLEMENTED
PLANNED
```

Do not silently invent functionality to make the project appear more complete.

This is especially important for:

```text
AI/ML
adaptive algorithms
medical validation
cloud infrastructure
advanced analytics
user authentication
production deployment
```

Only describe such functionality as implemented if it actually exists in the repository.

---

## 23. Do Not Break Existing Validated Behavior

When modifying the project:

1. Read `master_context.md`.
2. Inspect the relevant implementation.
3. Understand the existing data flow.
4. Make the smallest necessary change.
5. Preserve existing validated behavior.
6. Run appropriate checks.
7. Report exactly what changed.

Do not rewrite large portions of the application unnecessarily.

Do not change algorithm constants without a clear reason.

Do not remove existing functionality simply to simplify the implementation.

---

## 24. Do Not Add Unrequested Features

Do not proactively introduce:

```text
new sensors
new filtering algorithms
machine learning
cloud databases
authentication
new backend services
new UI systems
new correction modes
new medical claims
```

unless explicitly requested.

The goal is to maintain a stable, demonstrable academic prototype.

---

## 25. Code Modification Discipline

Before editing:

```text
Read → Understand → Modify → Test
```

Never modify a file based only on its filename.

When an error occurs:

1. Identify the actual error.
2. Locate the responsible implementation.
3. Determine whether the issue is architectural, type-related, runtime-related, or environment-related.
4. Fix the smallest appropriate layer.
5. Re-test.

Do not mask errors with unnecessary type casts or disabled TypeScript checks.

Avoid:

```text
any
@ts-ignore
@ts-nocheck
```

unless there is a documented and justified reason.

---

## 26. TypeScript

Maintain strict and meaningful TypeScript types.

Prefer existing domain types such as:

```text
PostureDirection
CalibrationResult
PostureSample
FeedbackEvent
CorrectionResponse
Session
```

over duplicating equivalent types in multiple files.

When a type mismatch occurs, determine whether the underlying model is wrong before using a cast.

---

## 27. Git Discipline

Do not perform destructive Git operations without explicit instruction.

Avoid:

```text
git reset --hard
git clean -fd
git push --force
```

unless explicitly requested.

Before significant Git operations:

```bash
git status
git branch
git remote -v
```

Check the repository state first.

Preserve backup branches when they contain previous project history until the migration is confirmed to be complete.

---

## 28. Repository Safety

Do not commit:

```text
node_modules/
.expo/
.env
.env.local
*.log
SQLite runtime databases
IDE-specific files
```

The SQLite database is runtime data and should remain ignored.

---

## 29. Documentation

When changing architecture or behavior, update the relevant project documentation.

Keep:

```text
master_context.md
```

consistent with the actual implementation.

Do not document functionality that does not exist.

Do not silently change the meaning of existing metrics, thresholds, or states.

---

## 30. Testing Expectations

For changes involving the backend, verify:

```text
backend starts
GET /api/sessions works
POST /api/sessions works
GET /api/sessions/:id works
SQLite persistence works
```

For changes involving the posture pipeline, verify the affected stages and ensure the real-time path remains functional.

For changes involving the frontend, verify the Expo application builds/runs with the project's configured Expo SDK and versioned documentation.

---

## 31. Priority Order

When instructions conflict, use this priority:

```text
1. Explicit user instruction
2. Current repository implementation
3. master_context.md
4. This AGENTS.md
5. General assumptions
```

Do not replace project-specific behavior with generic best practices without first checking the existing implementation.

---

## 32. Core Principle

PJT-I is an actively developed engineering prototype.

The priority is:

```text
Correctness
→ Stability
→ Traceability
→ Reproducibility
→ Minimal changes
→ Clear documentation
```

Preserve the validated posture-processing pipeline and make changes deliberately.