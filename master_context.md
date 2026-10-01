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
Personalized Deviation Detection
    ↓
Stability Detection
    ↓
Persistence Detection
    ↓
Feedback Controller
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
    ↓
Adaptive Feedback
```

The first part of this pipeline is real-time and local to the device.

The backend is primarily responsible for persistence and historical
analysis.

------------------------------------------------------------------------

# 4. CURRENT PROJECT STRUCTURE

Expected structure:

``` text
posture-belt/
├── package.json
├── package-lock.json
├── tsconfig.json
├── app.json
├── App.tsx
├── .gitignore
│
├── processing/
│   ├── calibration.ts
│   ├── correctionResponse.ts
│   ├── deviation.ts
│   ├── feedback.ts
│   ├── orientation.ts
│   ├── performanceMetrics.ts
│   ├── persistence.ts
│   ├── sessionRecorder.ts
│   └── stability.ts
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
    ├── posture.db
    └── src/
        ├── server.ts
        ├── database.ts
        └── routes/
            └── sessions.ts
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
6.  The completed session is uploaded asynchronously.
7.  Real-time detectors/controllers are reset.

The corrected implementation conceptually is:

``` ts
const currentSession = sessionRef.current;

if (
  currentSession === null ||
  currentSession.startTime === 0
) {
  return;
}

monitoringActive.current = false;

hapticService.stop();

correctionResponseDetector.reset();
setCorrectionResponse(null);

const completedSession =
  endSession(currentSession, Date.now());

sessionRef.current = completedSession;
setSession(completedSession);

const metrics =
  calculatePerformanceMetrics(completedSession);

setPerformanceMetrics(metrics);

uploadSession(
  completedSession,
  metrics
)
  .then(() => {
    console.log('Session successfully saved to backend');
  })
  .catch((error) => {
    console.error('Session upload failed:', error);
  });

persistenceDetector.reset();
setPersistence(null);

stabilityDetector.reset();
setStability(null);

feedbackController.reset();
setFeedback(null);

previousCorrectionFeedbackTimestamp.current = null;
```

The actual application may contain equivalent code with surrounding
UI/state handling.

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
Express
TypeScript
SQLite
better-sqlite3
cors
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
-   parse JSON
-   mount session routes
-   listen on port 3000

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
POST /api/sessions
GET /api/sessions
GET /api/sessions/:id
```

------------------------------------------------------------------------

## POST /api/sessions

Used to upload a completed session from the mobile application.

The completed session and calculated metrics are sent to the backend.

------------------------------------------------------------------------

## GET /api/sessions

Returns stored sessions.

Used for:

-   debugging
-   historical retrieval
-   future analytics

------------------------------------------------------------------------

## GET /api/sessions/:id

Returns one stored session by ID.

------------------------------------------------------------------------

# 44. FRONTEND API SERVICE

File:

``` text
services/apiService.ts
```

The frontend uploads completed sessions asynchronously.

The API base URL is configured using the Mac's LAN IP rather than
`localhost`.

At the time of successful testing, the Mac's LAN IP was:

``` text
10.219.193.17
```

The application therefore used:

``` ts
const API_BASE_URL = 'http://10.219.193.17:3000';
```

Important:

The LAN IP may change when the computer changes networks.

If the IP changes, the frontend API URL must be updated.

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

# 46. NETWORK DEBUGGING THAT WAS COMPLETED

The Mac's interfaces were checked using:

``` bash
ifconfig | grep "inet "
```

The relevant LAN address was:

``` text
10.219.193.17
```

After updating the API service, communication succeeded.

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
```

It imports:

``` ts
import { uploadSession } from './services/apiService';
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

------------------------------------------------------------------------

# 55. NEXT IMPLEMENTATION ROADMAP

The next development stages are:

``` text
1. Historical Analytics
2. Adaptive Feedback
3. Final Hardware Integration
4. Experimental Evaluation
```

The immediate next task is:

# HISTORICAL ANALYTICS

------------------------------------------------------------------------

# 56. HISTORICAL ANALYTICS --- NEXT TASK

The first analytics backend endpoints should be:

``` http
GET /api/metrics/summary
GET /api/metrics/trends
```

These should use stored sessions rather than changing the real-time
posture-processing pipeline.

------------------------------------------------------------------------

# 57. HISTORICAL SUMMARY

The historical summary should eventually aggregate information such as:

``` text
total sessions
total monitored time
average consistency
average correction time
total feedback events
total completed corrections
overall completion rate
average sampling rate
```

The exact UI and aggregation fields should remain consistent with the
currently implemented metrics.

------------------------------------------------------------------------

# 58. HISTORICAL TRENDS

The trends endpoint should support longitudinal analysis such as:

``` text
consistency over sessions
correction time over sessions
feedback frequency over sessions
completed corrections over sessions
direction-specific correction behavior
```

The purpose is to determine whether the user's posture behavior changes
over time.

------------------------------------------------------------------------

# 59. HISTORICAL ANALYTICS UI

After backend analytics endpoints are implemented, the frontend should
provide a historical analytics section.

Potential current-data-supported displays include:

``` text
Session history
Consistency trend
Average correction time
Feedback frequency
Correction completion rate
Direction-specific correction time
Monitoring duration
Actual sampling rate
```

Do not introduce metrics that are not actually computed or supported by
stored data.

------------------------------------------------------------------------

# 60. ADAPTIVE FEEDBACK --- FUTURE STAGE

Adaptive feedback is the project's longer-term algorithmic
personalization component.

The goal is to use historical user behavior to adjust feedback behavior
without changing the core safety/processing structure arbitrarily.

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
```

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

The currently known working LAN address was:

``` text
10.219.193.17
```

This is not guaranteed to remain permanent.

If backend upload fails with a connection error such as:

``` text
java.net.ConnectException
```

first check:

``` bash
ifconfig | grep "inet "
```

Then update:

``` text
services/apiService.ts
```

with the current reachable Mac LAN IP.

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
Stability detection
Persistence detection
Haptic feedback
Correction response tracking
Session recording
Performance metrics
Node.js backend
SQLite persistence
Real session upload
```

### Not yet implemented / future

``` text
Historical analytics endpoints/UI
Adaptive feedback
Final MPU6050 + ESP32 integration
Physical vibration motor
Large-scale experimental evaluation
```

These future components should not be presented as completed.

------------------------------------------------------------------------

# 70. CURRENT PROJECT STATE SUMMARY

At the current stage:

``` text
                    PJT-I
                     │
        ┌────────────┴────────────┐
        │                         │
   REAL-TIME                     DATA
   PIPELINE                    PIPELINE
        │                         │
        ↓                         ↓
     IMU input                Session
        ↓                    recording
 Orientation                     ↓
        ↓                    Metrics
 Complementary                    ↓
 Filter                         API
        ↓                         ↓
 Personalization              Backend
        ↓                         ↓
 Stability                     SQLite
        ↓
 Persistence
        ↓
 Feedback
        ↓
 Correction
```

The real-time processing pipeline is operational.

The session persistence pipeline is operational.

The next major software feature is historical analytics.

------------------------------------------------------------------------

# 71. IMMEDIATE NEXT ACTION

Implement historical analytics without modifying the validated real-time
posture pipeline.

Recommended order:

``` text
Step 1:
Create backend aggregation logic.

Step 2:
Implement:
GET /api/metrics/summary

Step 3:
Implement:
GET /api/metrics/trends

Step 4:
Test both endpoints using stored real sessions.

Step 5:
Create frontend historical analytics UI.

Step 6:
Verify that historical metrics match the session-level metrics.

Step 7:
Only after analytics are stable, begin adaptive feedback.
```

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
