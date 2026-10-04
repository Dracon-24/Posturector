import { useEffect, useRef, useState } from 'react';

import {
  DeviationResult,
  calculateDeviation,
  calculatePersonalizedThreshold,
} from './processing/deviation';

import {
  AdaptiveThresholdDiagnostics,
  AdaptiveThresholdState,
  AdaptiveThresholdController,
} from './processing/adaptiveThreshold';

import {
  AdaptiveFeedbackController,
} from './processing/adaptiveFeedback';

import {
  IMUData,
  IMUService,
} from './services/imuService';

import {
  OrientationEstimator,
} from './processing/orientation';

import {
  PostureSample,
  CalibrationResult,
  calculateCalibration,
} from './processing/calibration';

import {
  PersistenceDetector,
  PersistenceState,
} from './processing/persistence';

import {
  StabilityDetector,
  StabilityResult,
} from './processing/stability';

import {
  FeedbackReassertionController,
} from './processing/adaptiveFeedback';

import {
  FeedbackController,
  FeedbackState,
} from './processing/feedback';

import {
  HapticService,
} from './services/hapticService';

import {
  CorrectionResponseDetector,
  CorrectionResponseState,
} from './processing/correctionResponse';

import {
  Session,
  PostureDirection,
  startSession,
  recordPostureSample,
  recordFeedbackEvent,
  recordCorrectionResponse,
  endSession,
} from './processing/sessionRecorder';

import {
  PerformanceMetrics,
  calculatePerformanceMetrics,
} from './processing/performanceMetrics';

import {
  HistoricalSummary,
  HistoricalTrends,
  SessionUpload,
  fetchHistoricalSummary,
  fetchHistoricalTrends,
  fetchSessionById,
  SessionUploadError,
  uploadSession,
} from './services/apiService';

import {
  ApplicationShell,
  AppDestination,
  CalibrationStorageStatus,
  SessionUploadState,
} from './components/ApplicationShell';

import { calibrationStorage } from './services/calibrationStorage';


// =====================================
// OBJECTS
// =====================================

const orientationEstimator =
  new OrientationEstimator();

const imuService =
  new IMUService();

const persistenceDetector =
  new PersistenceDetector({
    persistenceDuration: 3,
  });

const stabilityDetector =
  new StabilityDetector({
    windowDuration: 2,
    maxPitchStd: 2,
    maxRollStd: 2,
  });

const feedbackController =
  new FeedbackController({
    vibrationDuration: 200,
  });

const feedbackReassertionController =
  new FeedbackReassertionController();

const hapticService =
  new HapticService();

const correctionResponseDetector =
  new CorrectionResponseDetector();

const adaptiveThresholdController =
  new AdaptiveThresholdController();

const adaptiveFeedbackController =
  new AdaptiveFeedbackController();


// =====================================
// CONFIGURATION
// =====================================

const CALIBRATION_DURATION = 30;

// Initial experimental values.
// These are NOT medical thresholds.
const MINIMUM_THRESHOLD = 4;
const VARIABILITY_FACTOR = 2;

// Development-only real-device validation output is intentionally
// throttled so sensor logging cannot approach the ~50 Hz processing rate.
const DEVICE_DIAGNOSTIC_INTERVAL = 5_000;
const DASHBOARD_UPDATE_INTERVAL = 200;


// =====================================
// INITIAL SENSOR DATA
// =====================================

const initialData: IMUData = {
  timestamp: 0,

  accelerometer: {
    x: 0,
    y: 0,
    z: 0,
  },

  gyroscope: {
    x: 0,
    y: 0,
    z: 0,
  },
};

interface DashboardRuntimeState {
  direction: PostureDirection;
  adaptiveDiagnostics: AdaptiveThresholdDiagnostics;
  adaptiveAdjustment: AdaptiveThresholdState;
  overallDeviation: number;
  samplingRate: number;
  monitoredDuration: number;
}


// =====================================
// APP
// =====================================

export default function App() {

  // =====================================
  // SENSOR STATE
  // =====================================

  const [imuData, setImuData] =
    useState<IMUData>(initialData);

  const [pitch, setPitch] =
    useState(0);

  const [roll, setRoll] =
    useState(0);

  const [persistence, setPersistence] =
    useState<PersistenceState | null>(null);

  const [stability, setStability] =
    useState<StabilityResult | null>(null);

  const [feedback, setFeedback] =
    useState<FeedbackState | null>(null);

  const [correctionResponse, setCorrectionResponse] =
    useState<CorrectionResponseState | null>(null);


  // =====================================
  // SESSION STATE
  // =====================================

  const [session, setSession] =
    useState<Session | null>(null);

  const [performanceMetrics, setPerformanceMetrics] =
    useState<PerformanceMetrics | null>(null);

  const [sessionUploadState, setSessionUploadState] =
    useState<SessionUploadState>('idle');

  const [activeView, setActiveView] =
    useState<AppDestination>('monitor');

  const [historicalSessionDetail, setHistoricalSessionDetail] =
    useState<SessionUpload | null>(null);

  const [historicalSessionLoading, setHistoricalSessionLoading] =
    useState(false);

  const [historicalSessionError, setHistoricalSessionError] =
    useState<string | null>(null);


  // =====================================
  // HISTORICAL ANALYTICS STATE
  // =====================================

  const [historicalSummary, setHistoricalSummary] =
    useState<HistoricalSummary | null>(null);

  const [historicalTrends, setHistoricalTrends] =
    useState<HistoricalTrends | null>(null);

  const [historicalLoading, setHistoricalLoading] =
    useState(false);

  const [historicalError, setHistoricalError] =
    useState<string | null>(null);


  // =====================================
  // CALIBRATION STATE
  // =====================================

  const [isCalibrating, setIsCalibrating] =
    useState(false);

  const [calibrationTime, setCalibrationTime] =
    useState(0);

  const [calibrationResult, setCalibrationResult] =
    useState<CalibrationResult | null>(null);

  const [calibrationSavedAt, setCalibrationSavedAt] =
    useState<number | null>(null);

  const [calibrationStorageStatus, setCalibrationStorageStatus] =
    useState<CalibrationStorageStatus>('loading');


  // =====================================
  // DEVIATION STATE
  // =====================================

  const [deviation, setDeviation] =
    useState<DeviationResult | null>(null);

  const [dashboardRuntime, setDashboardRuntime] =
    useState<DashboardRuntimeState>({
      direction: 'neutral',
      adaptiveDiagnostics:
        adaptiveThresholdController.getDiagnostics(),
      adaptiveAdjustment:
        adaptiveThresholdController.getState(),
      overallDeviation: 0,
      samplingRate: 0,
      monitoredDuration: 0,
    });


  // =====================================
  // REFS
  // =====================================

  const lastTimestamp =
    useRef<number | null>(null);

  const calibrationActive =
    useRef(false);

  const calibrationSamples =
    useRef<PostureSample[]>([]);

  const calibrationStartTimestamp =
    useRef<number | null>(null);

  const calibrationResultRef =
    useRef<CalibrationResult | null>(null);

  const sessionRef =
    useRef<Session | null>(null);

  /*
   * Separates:
   *
   * IMU service running
   *
   * from:
   *
   * posture monitoring actively running.
   */
  const monitoringActive =
    useRef(false);

  /*
   * Used to ensure a completed correction
   * response is recorded only once.
   */
  const previousCorrectionFeedbackTimestamp =
    useRef<number | null>(null);

  const lastDeviceDiagnosticTimestamp =
    useRef<number | null>(null);

  const lastDashboardTimestamp =
    useRef<number | null>(null);

  const analyticsMounted =
    useRef(true);

  const appMountedRef =
    useRef(true);

  const historicalLoadingRef =
    useRef(false);

  const historicalRefreshPendingRef =
    useRef(false);

  const sessionUploadActiveRef =
    useRef(false);

  const pendingUploadSessionRef =
    useRef<Session | null>(null);

  const pendingUploadMetricsRef =
    useRef<PerformanceMetrics | null>(null);

  const historicalSessionLoadingRef =
    useRef(false);


  // =====================================
  // SAVED CANONICAL CALIBRATION
  // =====================================

  useEffect(() => {
    let active = true;

    void calibrationStorage.load().then(result => {
      if (!active || !appMountedRef.current) {
        return;
      }

      if (result.status === 'loaded') {
        setCalibrationResult(result.value.calibration);
        calibrationResultRef.current = result.value.calibration;
        setCalibrationSavedAt(result.value.savedAt);
        setCalibrationStorageStatus('ready');
        return;
      }

      setCalibrationResult(null);
      calibrationResultRef.current = null;
      setCalibrationSavedAt(null);
      setCalibrationStorageStatus(result.status);
    });

    return () => {
      active = false;
    };
  }, []);


  // =====================================
  // HISTORICAL ANALYTICS
  // =====================================

  const loadHistoricalAnalytics = async () => {

    if (!analyticsMounted.current) {

      return;
    }


    if (historicalLoadingRef.current) {

      historicalRefreshPendingRef.current =
        true;

      return;
    }


    historicalLoadingRef.current =
      true;

    setHistoricalLoading(
      true
    );

    setHistoricalError(
      null
    );


    try {

      const [summary, trends] =
        await Promise.all([
          fetchHistoricalSummary(),
          fetchHistoricalTrends(),
        ]);


      if (!analyticsMounted.current) {
        return;
      }


      setHistoricalSummary(
        summary
      );

      setHistoricalTrends(
        trends
      );

    } catch (error) {

      console.error(
        'Historical analytics loading failed:',
        error
      );


      if (analyticsMounted.current) {

        setHistoricalError(
          'Unable to load historical analytics.'
        );

      }

    } finally {

      historicalLoadingRef.current =
        false;


      if (!analyticsMounted.current) {

        historicalRefreshPendingRef.current =
          false;

        return;
      }


      if (historicalRefreshPendingRef.current) {

        historicalRefreshPendingRef.current =
          false;

        void loadHistoricalAnalytics();

        return;
      }


      setHistoricalLoading(
        false
      );


    }
  };


  useEffect(() => {

    analyticsMounted.current =
      true;

    appMountedRef.current =
      true;

    void loadHistoricalAnalytics();


    return () => {

      analyticsMounted.current =
        false;

      appMountedRef.current =
        false;

      historicalRefreshPendingRef.current =
        false;

    };

  }, []);


  // =====================================
  // COMPLETED SESSION UPLOAD
  // =====================================

  const uploadCompletedSession = async (
    completedSession: Session,
    metrics: PerformanceMetrics
  ) => {

    if (sessionUploadActiveRef.current) {
      return;
    }


    sessionUploadActiveRef.current =
      true;

    pendingUploadSessionRef.current =
      completedSession;

    pendingUploadMetricsRef.current =
      metrics;

    setSessionUploadState(
      'uploading'
    );


    let shouldRefreshAnalytics =
      false;


    try {

      await uploadSession(
        completedSession,
        metrics
      );

      if (appMountedRef.current) {

        setSessionUploadState(
          'saved'
        );

      }

      pendingUploadSessionRef.current =
        null;

      pendingUploadMetricsRef.current =
        null;

      console.log(
        'Session successfully saved to backend'
      );

      shouldRefreshAnalytics =
        true;

    } catch (error) {

      if (
        error instanceof SessionUploadError &&
        error.status === 409
      ) {

        if (appMountedRef.current) {

          setSessionUploadState(
            'possibly-saved'
          );

        }

        pendingUploadSessionRef.current =
          null;

        pendingUploadMetricsRef.current =
          null;

        console.warn(
          'Session ID already exists on the backend'
        );

        shouldRefreshAnalytics =
          true;

      } else {

        if (appMountedRef.current) {

          setSessionUploadState(
            'failed'
          );

        }

        console.error(
          'Session upload failed:',
          error
        );

      }

    } finally {

      sessionUploadActiveRef.current =
        false;

    }


    if (shouldRefreshAnalytics) {
      await loadHistoricalAnalytics();
    }
  };


  const retrySessionUpload = () => {

    if (sessionUploadActiveRef.current) {
      return;
    }


    const completedSession =
      pendingUploadSessionRef.current;

    const metrics =
      pendingUploadMetricsRef.current;


    if (
      completedSession === null ||
      metrics === null
    ) {
      return;
    }


    void uploadCompletedSession(
      completedSession,
      metrics
    );
  };


  const openHistoricalSession = async (id: string) => {

    if (historicalSessionLoadingRef.current) {
      return;
    }

    historicalSessionLoadingRef.current =
      true;

    setHistoricalSessionLoading(
      true
    );

    setHistoricalSessionError(
      null
    );

    try {

      const storedSession =
        await fetchSessionById(id);

      if (storedSession.id !== id) {
        throw new Error('Stored session ID mismatch');
      }

      if (!appMountedRef.current) {
        return;
      }

      setHistoricalSessionDetail(
        storedSession
      );

      setActiveView(
        'session'
      );

    } catch (error) {

      console.error(
        'Historical session loading failed:',
        error
      );

      if (appMountedRef.current) {
        setHistoricalSessionError(
          'Unable to open this completed session.'
        );
      }

    } finally {

      historicalSessionLoadingRef.current =
        false;

      if (appMountedRef.current) {
        setHistoricalSessionLoading(
          false
        );
      }

    }
  };


  // =====================================
  // IMU SUBSCRIPTION
  // =====================================

  useEffect(() => {

    imuService.start((data) => {

      // ---------------------------------
      // Update raw sensor display
      // ---------------------------------

      setImuData(data);


      // ---------------------------------
      // First sample
      // ---------------------------------

      if (
        lastTimestamp.current === null
      ) {

        lastTimestamp.current =
          data.timestamp;

        return;
      }


      // ---------------------------------
      // Calculate actual dt
      // ---------------------------------

      const dt =
        (
          data.timestamp -
          lastTimestamp.current
        ) / 1000;


      /*
       * Ignore invalid time intervals.
       */

      if (
        dt <= 0 ||
        dt > 1
      ) {

        lastTimestamp.current =
          data.timestamp;

        return;
      }


      // =================================
      // ORIENTATION ESTIMATION
      // =================================

      const orientation =
        orientationEstimator.update(
          data.accelerometer.x,
          data.accelerometer.y,
          data.accelerometer.z,

          data.gyroscope.x,
          data.gyroscope.y,

          dt
        );


      /*
       * These are Body-frame values
       * according to the current phone
       * mounting configuration.
       */

      const bodyPitch =
        orientation.pitch;

      const bodyRoll =
        orientation.roll;


      setPitch(bodyPitch);
      setRoll(bodyRoll);


      // =================================
      // CALIBRATION
      // =================================

      if (
        calibrationActive.current
      ) {

        // ---------------------------------
        // Establish calibration start time
        // ---------------------------------

        if (
          calibrationStartTimestamp.current ===
          null
        ) {

          calibrationStartTimestamp.current =
            data.timestamp;
        }


        // ---------------------------------
        // Calculate elapsed time
        // ---------------------------------

        const elapsed =
          (
            data.timestamp -
            calibrationStartTimestamp.current
          ) / 1000;


        // ---------------------------------
        // Update calibration timer
        // ---------------------------------

        setCalibrationTime(
          Math.min(
            elapsed,
            CALIBRATION_DURATION
          )
        );


        // ---------------------------------
        // Store body orientation sample
        // ---------------------------------

        calibrationSamples.current.push({

          pitch:
            bodyPitch,

          roll:
            bodyRoll,

          timestamp:
            data.timestamp,

        });


        // ---------------------------------
        // Finish calibration
        // ---------------------------------

        if (
          elapsed >= CALIBRATION_DURATION
        ) {

          const result =
            calculateCalibration(
              calibrationSamples.current
            );


          /*
           * Save result to React state
           * for displaying it on screen.
           */

          setCalibrationResult(
            result
          );


          /*
           * Save result to ref so the
           * continuously running IMU
           * callback can immediately use it.
           */

          calibrationResultRef.current =
            result;


          // ---------------------------------
          // Enter calibrated-idle state
          // ---------------------------------

          if (
            result.valid
          ) {

            const savedAt = Date.now();

            setCalibrationSavedAt(savedAt);
            setCalibrationStorageStatus('ready');

            void calibrationStorage.save(result, savedAt).then(saved => {
              if (!saved && appMountedRef.current) {
                setCalibrationStorageStatus('unavailable');
              }
            });

            adaptiveThresholdController.reset();

            adaptiveFeedbackController.reset();

            feedbackReassertionController.stop();

            /*
             * A valid calibration is retained,
             * but monitoring begins only after
             * the user explicitly starts a new
             * session.
             */

            monitoringActive.current =
              false;

            lastDeviceDiagnosticTimestamp.current =
              null;

            lastDashboardTimestamp.current =
              null;

            setPerformanceMetrics(
              null
            );
          }


          /*
           * Stop calibration.
           */

          calibrationActive.current =
            false;

          setIsCalibrating(
            false
          );


          /*
           * Reset calibration timer reference.
           */

          calibrationStartTimestamp.current =
            null;


          /*
           * This sample belongs to calibration,
           * NOT monitoring.
           *
           * Therefore the next sample will
           * become the first monitoring sample.
           */

          lastTimestamp.current =
            data.timestamp;

          return;
        }
      }


      // =================================
      // DEVIATION DETECTION
      // =================================

      const currentCalibration =
        calibrationResultRef.current;


      /*
       * Monitoring processing only occurs
       * while an active monitoring session
       * exists.
       */

      if (
        monitoringActive.current &&
        currentCalibration !== null &&
        currentCalibration.valid
      ) {

        const adaptiveThresholdState =
          adaptiveThresholdController.getState();

        const canonicalPitchThreshold =
          MINIMUM_THRESHOLD +
          VARIABILITY_FACTOR * currentCalibration.pitchStd;

        const canonicalRollThreshold =
          MINIMUM_THRESHOLD +
          VARIABILITY_FACTOR * currentCalibration.rollStd;

        const result =
          calculateDeviation(

            bodyPitch,

            bodyRoll,

            // Personalized baseline

            currentCalibration.pitchBaseline,

            currentCalibration.rollBaseline,

            // Natural variability

            currentCalibration.pitchStd,

            currentCalibration.rollStd,

            // Experimental threshold configuration

            {
              minimumThreshold:
                MINIMUM_THRESHOLD,

              variabilityFactor:
                VARIABILITY_FACTOR,

              pitchThresholdAdjustment:
                adaptiveThresholdState.pitchAdjustment,

              rollThresholdAdjustment:
                adaptiveThresholdState.rollAdjustment,
            }
          );


        setDeviation(
          result
        );


        // ---------------------------------
        // Stability detection
        // ---------------------------------

        const stabilityResult =
          stabilityDetector.update(
            bodyPitch,
            bodyRoll,
            data.timestamp
          );


        setStability(
          stabilityResult
        );


        // ---------------------------------
        // Adaptive threshold window
        // ---------------------------------

        adaptiveThresholdController.update({
          timestamp: data.timestamp,
          pitchDeviation: result.pitchDeviation,
          rollDeviation: result.rollDeviation,
          pitchThreshold: result.pitchThreshold,
          rollThreshold: result.rollThreshold,
          stable: stabilityResult.stable,
        });


        // ---------------------------------
        // Persistence detection
        // ---------------------------------

        const persistenceResult =
          persistenceDetector.update(
            result.overallDeviation &&
            stabilityResult.stable,
            data.timestamp
          );


        setPersistence(
          persistenceResult
        );


        // ---------------------------------
        // Feedback decision
        // ---------------------------------

        const feedbackResult =
          feedbackController.update(
            persistenceResult.isSustained,
            data.timestamp,
            adaptiveFeedbackController.getState().mode
          );


        setFeedback(
          feedbackResult
        );


        // =================================
        // CURRENT DEVIATION
        // =================================

        const currentDeviation =
          Math.max(
            result.pitchDeviation,
            result.rollDeviation
          );


        // =================================
        // POSTURE ACCEPTABLE
        // =================================

        const postureAcceptable =
          !result.overallDeviation;


        // =================================
        // DETERMINE POSTURE DIRECTION
        // =================================

        const direction:
          PostureDirection =
          determinePostureDirection(
            bodyPitch,
            bodyRoll,

            currentCalibration.pitchBaseline,
            currentCalibration.rollBaseline,

            result.pitchDeviation,
            result.rollDeviation
          );


        // =================================
        // RECORD POSTURE SAMPLE
        // =================================

        if (
          sessionRef.current !== null
        ) {

          recordPostureSample(
            sessionRef.current,
            {

              timestamp:
                data.timestamp,

              pitch:
                bodyPitch,

              roll:
                bodyRoll,

              pitchDeviation:
                result.pitchDeviation,

              rollDeviation:
                result.rollDeviation,

              overallDeviation:
                currentDeviation,

              postureAcceptable,

              direction,

              pitchThreshold:
                result.pitchThreshold,

              rollThreshold:
                result.rollThreshold,

            }
          );

        }


        // =================================
        // START CORRECTION RESPONSE
        // =================================

        if (
          feedbackResult.shouldVibrate &&
          !correctionResponseDetector.getIsObserving()
        ) {

          /*
           * This is an actual feedback event.
           */

          if (
            sessionRef.current !== null
          ) {

            recordFeedbackEvent(
              sessionRef.current,
              {

                timestamp:
                  data.timestamp,

                deviation:
                  currentDeviation,

                direction,

              }
            );

          }

          /*
           * Remember the feedback event
           * currently being observed.
           */

          previousCorrectionFeedbackTimestamp.current =
            data.timestamp;


          correctionResponseDetector.startObservation(
            currentDeviation,
            data.timestamp,
            direction
          );


          /*
           * TESTING MODE:
           *
           * Continue vibration until posture
           * is corrected.
           */

          hapticService.startContinuous();

          feedbackReassertionController.start(
            feedbackResult.reassertInterval,
            () =>
              monitoringActive.current &&
              correctionResponseDetector.getIsObserving(),
            () => hapticService.startContinuous()
          );

        }


        // =================================
        // UPDATE CORRECTION RESPONSE
        // =================================

        const correctionResult =
          correctionResponseDetector.update(
            currentDeviation,
            data.timestamp,
            result.pitchOutside,
            result.rollOutside
          );


        setCorrectionResponse(
          correctionResult
        );


        // =================================
        // RECORD COMPLETED CORRECTION
        // =================================

        if (
          correctionResult.status ===
          'CORRECTED' &&

          correctionResult.feedbackTimestamp !==
          null &&

          previousCorrectionFeedbackTimestamp.current ===
          correctionResult.feedbackTimestamp
        ) {

          if (
            sessionRef.current !== null
          ) {

            recordCorrectionResponse(
              sessionRef.current,
              {

                feedbackTimestamp:
                  correctionResult.feedbackTimestamp,

                correctionTimestamp:
                  data.timestamp,

                initialDeviation:
                  correctionResult.initialDeviation,

                finalDeviation:
                  correctionResult.currentDeviation,

                responseTime:
                  correctionResult.responseTime,

                direction:
                  correctionResult.direction ??
                  'neutral',

              }
            );

          }


          adaptiveFeedbackController.recordCompletedResponse(
            correctionResult.responseTime
          );

          adaptiveThresholdController.recordCompletedCorrection(
            correctionResult.responseTime,
            data.timestamp
          );


          /*
           * Prevent duplicate recording.
           */

          previousCorrectionFeedbackTimestamp.current =
            null;

        }


        // =================================
        // STOP VIBRATION AFTER CORRECTION
        // =================================

        if (
          correctionResult.status ===
          'CORRECTED'
        ) {

          feedbackReassertionController.stop();

          hapticService.stop();

        }


        // =================================
        // THROTTLED DASHBOARD SNAPSHOT
        // =================================

        if (
          lastDashboardTimestamp.current === null ||
          data.timestamp - lastDashboardTimestamp.current >=
            DASHBOARD_UPDATE_INTERVAL
        ) {

          const activeSession =
            sessionRef.current;

          const monitoredDuration =
            activeSession !== null &&
            activeSession.startTime > 0
              ? Math.max(
                0,
                data.timestamp - activeSession.startTime
              )
              : 0;

          const samplingRate =
            activeSession !== null &&
            monitoredDuration > 0
              ? activeSession.sampleCount /
                (monitoredDuration / 1000)
              : 0;

          setDashboardRuntime({
            direction,
            adaptiveDiagnostics:
              adaptiveThresholdController.getDiagnostics(),
            adaptiveAdjustment:
              adaptiveThresholdController.getState(),
            overallDeviation: currentDeviation,
            samplingRate,
            monitoredDuration,
          });

          lastDashboardTimestamp.current =
            data.timestamp;

        }


        // =================================
        // DEVELOPMENT DEVICE DIAGNOSTICS
        // =================================

        if (
          __DEV__ &&
          (
            lastDeviceDiagnosticTimestamp.current === null ||
            data.timestamp - lastDeviceDiagnosticTimestamp.current >=
              DEVICE_DIAGNOSTIC_INTERVAL
          )
        ) {

          const activeSession =
            sessionRef.current;

          const elapsedMonitoringSeconds =
            activeSession !== null &&
            activeSession.startTime > 0
              ? (
                data.timestamp -
                activeSession.startTime
              ) / 1000
              : 0;

          const liveSamplingRate =
            activeSession !== null &&
            elapsedMonitoringSeconds > 0
              ? activeSession.sampleCount /
                elapsedMonitoringSeconds
              : 0;

          const adaptiveDiagnostics =
            adaptiveThresholdController.getDiagnostics();

          console.log(
            '[PJT-I device validation]',
            {
              timestamp: data.timestamp,
              samplingRate: liveSamplingRate,
              pitch: bodyPitch,
              roll: bodyRoll,
              pitchDeviation: result.pitchDeviation,
              rollDeviation: result.rollDeviation,
              pitchThreshold: result.pitchThreshold,
              rollThreshold: result.rollThreshold,
              stable: stabilityResult.stable,
              persistenceDuration:
                persistenceResult.elapsedOutside,
              feedbackActive:
                feedbackResult.shouldVibrate,
              correctionState:
                correctionResult.status,
              correctionResponseTime:
                correctionResult.status === 'CORRECTED'
                  ? correctionResult.responseTime
                  : correctionResult.elapsedTime,
              correctionDetails: {
                feedbackTimestamp:
                  correctionResult.feedbackTimestamp,
                correctionTimestamp:
                  correctionResult.status === 'CORRECTED'
                    ? data.timestamp
                    : null,
                initialDeviation:
                  correctionResult.initialDeviation,
                finalDeviation:
                  correctionResult.currentDeviation,
                direction:
                  correctionResult.direction,
              },
              adaptiveEvidence: {
                pitch:
                  adaptiveDiagnostics.pitch.combinedEvidence,
                roll:
                  adaptiveDiagnostics.roll.combinedEvidence,
              },
              adaptiveEMA: {
                pitch:
                  adaptiveDiagnostics.pitch.evidenceEma,
                roll:
                  adaptiveDiagnostics.roll.evidenceEma,
              },
              adaptiveThreshold: {
                pitch: result.pitchThreshold,
                roll: result.rollThreshold,
              },
              canonicalThreshold: {
                pitch: canonicalPitchThreshold,
                roll: canonicalRollThreshold,
              },
              adaptiveAdjustment:
                adaptiveThresholdState,
              adaptiveThresholdMode:
                adaptiveThresholdController.getMode(),
              adaptiveFeedbackMode:
                adaptiveFeedbackController.getState().mode,
            }
          );

          lastDeviceDiagnosticTimestamp.current =
            data.timestamp;

        }

      }


      // ---------------------------------
      // Save timestamp
      // ---------------------------------

      lastTimestamp.current =
        data.timestamp;

    });


    // =====================================
    // CLEANUP
    // =====================================

    return () => {

      imuService.stop();

      hapticService.stop();

      feedbackReassertionController.stop();

      adaptiveThresholdController.reset();

      adaptiveFeedbackController.reset();

      lastTimestamp.current =
        null;

      lastDeviceDiagnosticTimestamp.current =
        null;

      lastDashboardTimestamp.current =
        null;

    };

  }, []);


  // =====================================
  // START CALIBRATION
  // =====================================

  const startCalibration = () => {

    if (monitoringActive.current) {
      return;
    }

    if (calibrationActive.current) {
      return;
    }

    if (pendingUploadSessionRef.current !== null) {
      return;
    }


    /*
     * Any previous monitoring session
     * is no longer active.
     */

    monitoringActive.current =
      false;


    /*
     * Remove all previous calibration
     * samples.
     */

    calibrationSamples.current =
      [];


    /*
     * Reset calibration timer.
     */

    setCalibrationTime(
      0
    );


    /*
     * Remove previous calibration result
     * from the UI.
     */

    setCalibrationResult(
      null
    );


    /*
     * Remove previous calibration result
     * from the processing pipeline.
     */

    calibrationResultRef.current =
      null;


    /*
     * Remove old deviation result.
     */

    setDeviation(
      null
    );


    // ---------------------------------
    // Reset persistence
    // ---------------------------------

    persistenceDetector.reset();

    setPersistence(
      null
    );


    // ---------------------------------
    // Reset stability
    // ---------------------------------

    stabilityDetector.reset();

    setStability(
      null
    );


    // ---------------------------------
    // Reset feedback
    // ---------------------------------

    feedbackController.reset();

    feedbackReassertionController.stop();

    adaptiveThresholdController.reset();

    adaptiveFeedbackController.reset();

    setFeedback(
      null
    );


    // ---------------------------------
    // Reset correction response
    // ---------------------------------

    correctionResponseDetector.reset();

    setCorrectionResponse(
      null
    );

    setDashboardRuntime({
      direction: 'neutral',
      adaptiveDiagnostics:
        adaptiveThresholdController.getDiagnostics(),
      adaptiveAdjustment:
        adaptiveThresholdController.getState(),
      overallDeviation: 0,
      samplingRate: 0,
      monitoredDuration: 0,
    });


    // ---------------------------------
    // Reset correction event tracking
    // ---------------------------------

    previousCorrectionFeedbackTimestamp.current =
      null;

    lastDeviceDiagnosticTimestamp.current =
      null;

    lastDashboardTimestamp.current =
      null;


    // ---------------------------------
    // Stop vibration
    // ---------------------------------

    hapticService.stop();


    // ---------------------------------
    // Reset session
    // ---------------------------------

    sessionRef.current =
      null;

    setSession(
      null
    );

    setPerformanceMetrics(
      null
    );

    setSessionUploadState(
      'idle'
    );


    /*
     * Reset calibration start timestamp.
     */

    calibrationStartTimestamp.current =
      null;


    /*
     * Activate calibration.
     */

    calibrationActive.current =
      true;

    setIsCalibrating(
      true
    );

    setActiveView(
      'monitor'
    );
  };


  // =====================================
  // START MONITORING
  // =====================================

  const startMonitoring = () => {

    if (monitoringActive.current) {
      return;
    }

    const currentCalibration =
      calibrationResultRef.current;

    if (
      currentCalibration === null ||
      !currentCalibration.valid
    ) {
      return;
    }

    /*
     * Do not replace a finalized session while
     * its persistence result is unresolved.
     */
    if (
      sessionUploadActiveRef.current ||
      pendingUploadSessionRef.current !== null
    ) {
      return;
    }

    hapticService.stop();

    feedbackReassertionController.stop();

    adaptiveThresholdController.reset();

    adaptiveFeedbackController.reset();

    correctionResponseDetector.reset();

    persistenceDetector.reset();

    stabilityDetector.reset();

    feedbackController.reset();

    previousCorrectionFeedbackTimestamp.current =
      null;

    lastDeviceDiagnosticTimestamp.current =
      null;

    lastDashboardTimestamp.current =
      null;

    setDeviation(
      null
    );

    setStability(
      null
    );

    setPersistence(
      null
    );

    setFeedback(
      null
    );

    setCorrectionResponse(
      null
    );

    setDashboardRuntime({
      direction: 'neutral',
      adaptiveDiagnostics:
        adaptiveThresholdController.getDiagnostics(),
      adaptiveAdjustment:
        adaptiveThresholdController.getState(),
      overallDeviation: 0,
      samplingRate: 0,
      monitoredDuration: 0,
    });

    const newSession =
      startSession(currentCalibration);

    sessionRef.current =
      newSession;

    setSession(
      newSession
    );

    setPerformanceMetrics(
      null
    );

    setSessionUploadState(
      'idle'
    );

    monitoringActive.current =
      true;

    setHistoricalSessionDetail(
      null
    );

    setActiveView(
      'monitor'
    );

  };


  // =====================================
  // STOP MONITORING
  // =====================================

  const stopMonitoring = () => {

    if (!monitoringActive.current) {
      return;
    }

    /*
     * Get the currently active session.
     */

    const currentSession =
      sessionRef.current;


    /*
     * Nothing to stop if there is no
     * active monitoring session.
     */

    if (
      currentSession === null
    ) {

      return;

    }


    /*
     * IMPORTANT:
     *
     * Stop the real-time monitoring pipeline
     * immediately.
     *
     * The IMU service itself can remain active,
     * but posture processing is disabled.
     */

    monitoringActive.current =
      false;


    // ---------------------------------
    // Stop vibration
    // ---------------------------------

    hapticService.stop();

    feedbackReassertionController.stop();


    /*
     * If a correction is currently being
     * observed, it is incomplete.
     *
     * It must NOT be recorded as a
     * successful correction.
     */

    correctionResponseDetector.reset();

    setCorrectionResponse(
      null
    );


    // ---------------------------------
    // End session ONCE
    // ---------------------------------

    const completedSession =
      endSession(
        currentSession,
        Date.now()
      );


    /*
     * Save completed session locally.
     */

    sessionRef.current =
      completedSession;

    setSession(
      completedSession
    );


    // ---------------------------------
    // Calculate performance metrics
    // ---------------------------------

    const metrics =
      calculatePerformanceMetrics(
        completedSession
      );


    setPerformanceMetrics(
      metrics
    );

    setHistoricalSessionDetail(
      null
    );

    setActiveView(
      'session'
    );


    // =================================
    // UPLOAD SESSION TO BACKEND
    // =================================

    /*
     * The local session and metrics have
     * already been finalized.
     *
     * Backend upload happens separately so
     * a network/backend failure does not
     * affect the local monitoring result.
     */

    void uploadCompletedSession(
      completedSession,
      metrics
    );


    // ---------------------------------
    // Reset live controllers
    // ---------------------------------

    persistenceDetector.reset();

    setPersistence(
      null
    );


    stabilityDetector.reset();

    setStability(
      null
    );


    feedbackController.reset();

    feedbackReassertionController.stop();

    adaptiveThresholdController.reset();

    adaptiveFeedbackController.reset();

    setFeedback(
      null
    );


    previousCorrectionFeedbackTimestamp.current =
      null;

    lastDeviceDiagnosticTimestamp.current =
      null;

    lastDashboardTimestamp.current =
      null;

  };


  // =====================================
  // UI
  // =====================================

  const calibrated =
    calibrationResult !== null &&
    calibrationResult.valid;

  const monitoring =
    monitoringActive.current;

  const lifecycleState =
    isCalibrating
      ? 'CALIBRATING'
      : monitoring
        ? 'MONITORING'
        : sessionUploadActiveRef.current
          ? 'SYNCING RESULT'
          : calibrated
            ? 'CALIBRATED IDLE'
            : 'UNCALIBRATED';

  const postureState =
    !monitoring || deviation === null
      ? 'AWAITING MONITORING'
      : correctionResponse?.status === 'OBSERVING'
        ? 'CORRECTING'
        : deviation.overallDeviation
          ? 'DEVIATION'
          : 'GOOD';

  const postureTone =
    postureState === 'GOOD'
      ? 'good'
      : postureState === 'DEVIATION' ||
        postureState === 'CORRECTING'
        ? 'warning'
        : 'neutral';

  const activeAdaptiveDiagnostics =
    monitoring
      ? dashboardRuntime.adaptiveDiagnostics
      : adaptiveThresholdController.getDiagnostics();

  const activeAdaptiveAdjustment =
    monitoring
      ? dashboardRuntime.adaptiveAdjustment
      : adaptiveThresholdController.getState();

  const canonicalPitchThreshold =
    calibrated
      ? MINIMUM_THRESHOLD +
        VARIABILITY_FACTOR * calibrationResult.pitchStd
      : null;

  const canonicalRollThreshold =
    calibrated
      ? MINIMUM_THRESHOLD +
        VARIABILITY_FACTOR * calibrationResult.rollStd
      : null;

  const latestCorrection =
    session?.correctionResponses.at(-1) ?? null;

  const sensorActive =
    imuData.timestamp > 0;

  const displayedResult =
    historicalSessionDetail ??
    (
      session !== null &&
      performanceMetrics !== null &&
      session.endTime !== null
        ? {
          ...session,
          metrics: performanceMetrics,
        }
        : null
    );

  const displayedCanonicalPitchThreshold =
    displayedResult === null
      ? null
      : calculatePersonalizedThreshold(
        displayedResult.calibration.pitchStd,
        {
          minimumThreshold: MINIMUM_THRESHOLD,
          variabilityFactor: VARIABILITY_FACTOR,
        }
      );

  const displayedCanonicalRollThreshold =
    displayedResult === null
      ? null
      : calculatePersonalizedThreshold(
        displayedResult.calibration.rollStd,
        {
          minimumThreshold: MINIMUM_THRESHOLD,
          variabilityFactor: VARIABILITY_FACTOR,
        }
      );

  return (
    <ApplicationShell
      activeDestination={activeView}
      onChangeDestination={setActiveView}
      imuData={imuData}
      pitch={pitch}
      roll={roll}
      calibration={calibrationResult}
      calibrationSavedAt={calibrationSavedAt}
      calibrationStorageStatus={calibrationStorageStatus}
      isCalibrating={isCalibrating}
      calibrationTime={calibrationTime}
      calibrationDuration={CALIBRATION_DURATION}
      monitoring={monitoring}
      deviation={deviation}
      stability={stability}
      persistence={persistence}
      feedback={feedback}
      correction={correctionResponse}
      runtime={dashboardRuntime}
      canonicalPitchThreshold={canonicalPitchThreshold}
      canonicalRollThreshold={canonicalRollThreshold}
      adaptiveDiagnostics={activeAdaptiveDiagnostics}
      adaptiveAdjustment={activeAdaptiveAdjustment}
      adaptiveMode={adaptiveThresholdController.getMode()}
      session={session}
      metrics={performanceMetrics}
      displayedResult={displayedResult}
      displayedCanonicalPitchThreshold={displayedCanonicalPitchThreshold}
      displayedCanonicalRollThreshold={displayedCanonicalRollThreshold}
      uploadState={sessionUploadState}
      uploadPending={
        sessionUploadActiveRef.current ||
        pendingUploadSessionRef.current !== null
      }
      onStartCalibration={startCalibration}
      onStartMonitoring={startMonitoring}
      onStopMonitoring={stopMonitoring}
      onRetryUpload={retrySessionUpload}
      historicalSummary={historicalSummary}
      historicalTrends={historicalTrends}
      historicalLoading={historicalLoading}
      historicalError={historicalError}
      onRefreshHistory={() => void loadHistoricalAnalytics()}
      onOpenHistoricalSession={openHistoricalSession}
      historicalSessionLoading={historicalSessionLoading}
      historicalSessionError={historicalSessionError}
    />
  );
}

// =====================================
// DETERMINE POSTURE DIRECTION
// =====================================

function determinePostureDirection(
  pitch: number,
  roll: number,

  pitchBaseline: number,
  rollBaseline: number,

  pitchDeviation: number,
  rollDeviation: number
): PostureDirection {

  /*
   * No meaningful deviation.
   */

  if (
    pitchDeviation === 0 &&
    rollDeviation === 0
  ) {

    return 'neutral';

  }


  /*
   * If pitch deviation is greater than
   * or equal to roll deviation, classify
   * the deviation using the pitch axis.
   */

  if (
    pitchDeviation >=
    rollDeviation
  ) {

    const pitchDifference =
      pitch -
      pitchBaseline;


    if (
      pitchDifference > 0
    ) {

      return 'forward';

    }


    if (
      pitchDifference < 0
    ) {

      return 'backward';

    }

  }


  /*
   * Otherwise classify using roll.
   */

  else {

    const rollDifference =
      roll -
      rollBaseline;


    if (
      rollDifference > 0
    ) {

      return 'right';

    }


    if (
      rollDifference < 0
    ) {

      return 'left';

    }

  }


  return 'neutral';
}
