import { StatusBar } from 'expo-status-bar';
import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
} from 'react-native';

import {
  DeviationResult,
  calculateDeviation,
} from './processing/deviation';

import {
  AdaptiveThresholdDiagnostics,
  AdaptiveThresholdState,
  AxisAdaptiveThresholdDiagnostics,
  AdaptiveThresholdController,
  MAX_ADAPTIVE_ADJUSTMENT,
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
  SessionResultsDashboard,
} from './components/SessionResultsDashboard';

import {
  HistoricalAnalyticsDashboard,
} from './components/HistoricalAnalyticsDashboard';


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

type SessionUploadState =
  | 'idle'
  | 'uploading'
  | 'saved'
  | 'failed'
  | 'possibly-saved';

type AppView =
  | 'monitor'
  | 'results'
  | 'history';

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
    useState<AppView>('monitor');

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
        'results'
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
      'results'
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

  const openLatestResult = () => {
    if (
      session === null ||
      performanceMetrics === null ||
      session.endTime === null
    ) {
      if (historicalSessionDetail !== null) {
        setActiveView(
          'results'
        );
      }

      return;
    }

    setHistoricalSessionDetail(
      null
    );

    setActiveView(
      'results'
    );
  };

  return (

    <ScrollView
      contentContainerStyle={
        styles.container
      }
    >

      {/* =================================
          HEADER
      ================================= */}

      <View style={styles.appHeader}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>P</Text>
        </View>

        <View style={styles.brandCopy}>
          <Text style={styles.eyebrow}>PJT-I</Text>
          <Text style={styles.title}>
            Personalized Adaptive{`\n`}Posture Correction
          </Text>
        </View>
      </View>

      <View style={styles.headerStatusGrid}>
        <StatusPill
          label="Lifecycle"
          value={lifecycleState}
          tone={monitoring ? 'active' : 'neutral'}
        />
        <StatusPill
          label="Sensor"
          value={sensorActive ? 'IMU ACTIVE' : 'CONNECTING'}
          tone={sensorActive ? 'good' : 'neutral'}
        />
        <StatusPill
          label="Calibration"
          value={calibrated ? 'VALID' : isCalibrating ? 'IN PROGRESS' : 'REQUIRED'}
          tone={calibrated ? 'good' : 'neutral'}
        />
        {sessionUploadState !== 'idle' && (
          <StatusPill
            label="Session storage"
            value={formatSessionStorageState(sessionUploadState)}
            tone={
              sessionUploadState === 'saved'
                ? 'good'
                : sessionUploadState === 'failed' || sessionUploadState === 'possibly-saved'
                  ? 'warning'
                  : 'active'
            }
          />
        )}
      </View>

      <View style={styles.demoBanner}>
        <View style={styles.demoDot} />
        <View style={styles.flexOne}>
          <Text style={styles.demoTitle}>
            {adaptiveThresholdController.getMode() === 'DEMO'
              ? 'DEMO — accelerated adaptive timing'
              : 'PRODUCTION — normal adaptive timing'}
          </Text>
          <Text style={styles.demoBody}>
            Temporary engineering review configuration. Not production-validated timing.
          </Text>
        </View>
      </View>

      <View style={styles.navigationBar}>
        <NavigationButton
          label="Monitor"
          active={activeView === 'monitor'}
          onPress={() => setActiveView('monitor')}
        />
        <NavigationButton
          label="Session Results"
          active={activeView === 'results'}
          disabled={monitoring || isCalibrating || displayedResult === null}
          onPress={openLatestResult}
        />
        <NavigationButton
          label="History"
          active={activeView === 'history'}
          disabled={monitoring || isCalibrating}
          onPress={() => setActiveView('history')}
        />
      </View>


      {activeView === 'monitor' && (
        <>

      {/* CURRENT POSTURE */}

      <View style={[
        styles.heroCard,
        postureTone === 'good'
          ? styles.heroGood
          : postureTone === 'warning'
            ? styles.heroWarning
            : styles.heroNeutral,
      ]}>
        <Text style={styles.heroLabel}>CURRENT POSTURE</Text>
        <Text style={styles.heroState}>{postureState}</Text>
        <Text style={styles.heroDirection}>
          {monitoring
            ? `Direction · ${formatDirection(dashboardRuntime.direction)}`
            : calibrated
              ? 'Calibration ready — start monitoring when prepared.'
              : 'Complete personalized calibration to begin.'}
        </Text>

        <View style={styles.heroMetrics}>
          <HeroMetric label="Pitch" value={`${pitch.toFixed(1)}°`} />
          <View style={styles.heroDivider} />
          <HeroMetric label="Roll" value={`${roll.toFixed(1)}°`} />
        </View>

        <Text style={styles.heroExplanation}>
          {!monitoring || deviation === null
            ? 'Posture classification begins only during an active monitoring session.'
            : deviation.overallDeviation
              ? 'One or more axes are outside the current effective adaptive threshold.'
              : 'Pitch and roll are within the current effective adaptive thresholds.'}
        </Text>
      </View>


      {/* ORIENTATION */}

      <SectionCard
        title="Orientation"
        caption="Filtered body-frame orientation relative to the calibrated posture."
      >
        <View style={styles.orientationLayout}>
          <View style={styles.orientationVisual}>
            <View style={styles.orientationCrossHorizontal} />
            <View style={styles.orientationCrossVertical} />
            <View
              style={[
                styles.orientationIndicator,
                {
                  transform: [
                    { translateY: clampDisplayOffset(pitch) },
                    { rotate: `${clampDisplayAngle(roll)}deg` },
                  ],
                },
              ]}
            >
              <View style={styles.orientationIndicatorLine} />
            </View>
          </View>

          <View style={styles.orientationValues}>
            <MetricRow label="Body pitch" value={`${pitch.toFixed(2)}°`} />
            <MetricRow label="Body roll" value={`${roll.toFixed(2)}°`} />
            <MetricRow
              label="Direction"
              value={monitoring ? formatDirection(dashboardRuntime.direction) : 'Neutral'}
            />
          </View>
        </View>

        <View style={styles.subtlePanel}>
          <Text style={styles.subtlePanelTitle}>Personalized calibration baseline</Text>
          <View style={styles.twoColumnMetrics}>
            <CompactMetric
              label="Pitch baseline"
              value={calibrated ? `${calibrationResult.pitchBaseline.toFixed(2)}°` : '—'}
            />
            <CompactMetric
              label="Roll baseline"
              value={calibrated ? `${calibrationResult.rollBaseline.toFixed(2)}°` : '—'}
            />
          </View>
        </View>
      </SectionCard>


      {/* DEVIATION */}

      <SectionCard
        title="Personalized Deviation"
        caption="Canonical thresholds stay fixed; adaptive adjustments affect only the effective thresholds."
      >
        <View style={styles.axisGrid}>
          <AxisDeviationPanel
            axis="Pitch"
            deviation={deviation?.pitchDeviation ?? null}
            canonicalThreshold={canonicalPitchThreshold}
            effectiveThreshold={deviation?.pitchThreshold ?? null}
            adjustment={activeAdaptiveAdjustment.pitchAdjustment}
            outside={deviation?.pitchOutside ?? false}
            available={monitoring && deviation !== null}
          />
          <AxisDeviationPanel
            axis="Roll"
            deviation={deviation?.rollDeviation ?? null}
            canonicalThreshold={canonicalRollThreshold}
            effectiveThreshold={deviation?.rollThreshold ?? null}
            adjustment={activeAdaptiveAdjustment.rollAdjustment}
            outside={deviation?.rollOutside ?? false}
            available={monitoring && deviation !== null}
          />
        </View>

        <View style={styles.legendRow}>
          <View style={[styles.legendSwatch, styles.canonicalSwatch]} />
          <Text style={styles.legendText}>Canonical personalized threshold</Text>
          <View style={[styles.legendSwatch, styles.effectiveSwatch]} />
          <Text style={styles.legendText}>Effective adaptive threshold</Text>
        </View>

        <View style={styles.deviationSummary}>
          <CompactMetric
            label="Overall deviation"
            value={monitoring && deviation ? `${dashboardRuntime.overallDeviation.toFixed(2)}°` : '—'}
          />
          <CompactMetric
            label="Overall status"
            value={monitoring && deviation ? deviation.overallDeviation ? 'Outside' : 'Within' : 'Waiting'}
          />
        </View>
      </SectionCard>


      {/* STABILITY + PERSISTENCE */}

      <SectionCard
        title="Stability & Persistence"
        caption="Feedback eligibility requires stable posture and a sustained deviation."
      >
        <View style={styles.signalGrid}>
          <SignalPanel
            title="Stability"
            status={
              !monitoring || stability === null
                ? 'Waiting'
                : stability.stable
                  ? 'Stable'
                  : 'Movement detected'
            }
            active={monitoring && stability?.stable === true}
          >
            <MetricRow label="Pitch variability" value={stability ? `${stability.pitchStd.toFixed(2)}°` : '—'} />
            <MetricRow label="Roll variability" value={stability ? `${stability.rollStd.toFixed(2)}°` : '—'} />
            <MetricRow label="Window samples" value={stability ? `${stability.sampleCount}` : '—'} />
            <MetricRow label="Window duration" value={stability ? `${stability.windowDuration.toFixed(1)} s` : '—'} />
          </SignalPanel>

          <SignalPanel
            title="Persistence"
            status={
              !monitoring || persistence === null
                ? 'Waiting'
                : persistence.isSustained
                  ? 'Sustained'
                  : persistence.isOutside
                    ? 'Accumulating'
                    : 'Reset'
            }
            active={monitoring && persistence?.isSustained === true}
            warning={monitoring && persistence?.isOutside === true}
          >
            <MetricRow
              label="Outside duration"
              value={persistence ? `${persistence.elapsedOutside.toFixed(1)} s` : '—'}
            />
            <Text style={styles.progressLabel}>3-second persistence requirement</Text>
            <ProgressBar
              value={persistence ? persistence.elapsedOutside / 3 : 0}
              warning={persistence?.isOutside === true}
            />
            <Text style={styles.microcopy}>
              {persistence?.isOutside
                ? stability?.stable
                  ? 'Stable deviation is accumulating.'
                  : 'Transient instability resets accumulation.'
                : 'No eligible deviation is accumulating.'}
            </Text>
          </SignalPanel>
        </View>
      </SectionCard>


      {/* FEEDBACK + CORRECTION */}

      <SectionCard
        title="Feedback & Correction"
        caption="Adaptive feedback persistence is separate from adaptive threshold relaxation."
      >
        <View style={styles.feedbackHeader}>
          <View>
            <Text style={styles.fieldLabel}>HAPTIC FEEDBACK</Text>
            <Text style={feedback?.shouldVibrate ? styles.feedbackActive : styles.feedbackInactive}>
              {feedback?.shouldVibrate ? 'ACTIVE' : 'INACTIVE'}
            </Text>
          </View>
          <StatusPill
            label="Adaptive feedback"
            value={feedback?.adaptiveMode ?? adaptiveFeedbackController.getState().mode}
            tone={feedback?.adaptiveMode === 'NORMAL' ? 'neutral' : 'active'}
          />
        </View>

        <View style={styles.twoColumnMetrics}>
          <CompactMetric
            label="Feedback direction"
            value={feedback?.shouldVibrate ? formatDirection(correctionResponse?.direction ?? dashboardRuntime.direction) : 'None'}
          />
          <CompactMetric
            label="Correction state"
            value={correctionResponse?.status ?? 'WAITING'}
          />
          <CompactMetric
            label="Feedback timestamp"
            value={formatTimestamp(correctionResponse?.feedbackTimestamp ?? null)}
          />
          <CompactMetric
            label="Response duration"
            value={
              correctionResponse?.status === 'CORRECTED'
                ? `${correctionResponse.responseTime.toFixed(2)} s`
                : correctionResponse?.status === 'OBSERVING'
                  ? `${correctionResponse.elapsedTime.toFixed(1)} s`
                  : '—'
            }
          />
        </View>

        <View style={styles.subtlePanel}>
          <Text style={styles.subtlePanelTitle}>Latest completed correction</Text>
          {latestCorrection === null ? (
            <Text style={styles.emptyText}>No completed correction in this session.</Text>
          ) : (
            <>
              <MetricRow label="Direction" value={formatDirection(latestCorrection.direction)} />
              <MetricRow label="Correction timestamp" value={formatTimestamp(latestCorrection.correctionTimestamp)} />
              <MetricRow label="Response time" value={`${latestCorrection.responseTime.toFixed(2)} s`} />
              <MetricRow label="Deviation" value={`${latestCorrection.initialDeviation.toFixed(2)}° → ${latestCorrection.finalDeviation.toFixed(2)}°`} />
            </>
          )}
        </View>
      </SectionCard>


      {/* ADAPTIVE THRESHOLD */}

      <SectionCard
        title="Adaptive Threshold Internals"
        caption="Behavioral evidence can temporarily relax effective thresholds without changing calibration."
        accessory={
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>{adaptiveThresholdController.getMode()}</Text>
          </View>
        }
      >
        <AdaptiveAxisPanel
          axis="Pitch"
          diagnostics={activeAdaptiveDiagnostics.pitch}
          adjustment={activeAdaptiveAdjustment.pitchAdjustment}
          canonicalThreshold={canonicalPitchThreshold}
          effectiveThreshold={deviation?.pitchThreshold ?? canonicalPitchThreshold}
        />

        <AdaptiveAxisPanel
          axis="Roll"
          diagnostics={activeAdaptiveDiagnostics.roll}
          adjustment={activeAdaptiveAdjustment.rollAdjustment}
          canonicalThreshold={canonicalRollThreshold}
          effectiveThreshold={deviation?.rollThreshold ?? canonicalRollThreshold}
        />

        <View style={styles.adaptationSummary}>
          <CompactMetric
            label="Maximum adjustment"
            value={`+${MAX_ADAPTIVE_ADJUSTMENT.toFixed(0)}°`}
          />
          <CompactMetric
            label="Valid adaptive samples"
            value={`${activeAdaptiveDiagnostics.validSampleCount}`}
          />
          <CompactMetric
            label="Correction responses"
            value={`${activeAdaptiveDiagnostics.correctionResponseCount}`}
          />
          <CompactMetric
            label="Observation duration"
            value={`${(activeAdaptiveDiagnostics.observationDuration / 1000).toFixed(1)} s`}
          />
        </View>
      </SectionCard>


      {/* RUNTIME STATUS */}

      <SectionCard
        title="Runtime Status"
        caption="Live engineering telemetry for device and session validation."
      >
        <View style={styles.runtimeGrid}>
          <CompactMetric label="Monitoring" value={monitoring ? 'Active' : 'Inactive'} />
          <CompactMetric label="Calibration" value={calibrated ? 'Valid' : 'Unavailable'} />
          <CompactMetric label="IMU stream" value={sensorActive ? 'Receiving' : 'Connecting'} />
          <CompactMetric
            label="Sampling rate"
            value={monitoring ? `${dashboardRuntime.samplingRate.toFixed(1)} Hz` : '—'}
          />
          <CompactMetric
            label="Session elapsed"
            value={monitoring ? formatDuration(dashboardRuntime.monitoredDuration) : '—'}
          />
          <CompactMetric label="Target rate" value="≈ 50 Hz" />
        </View>

        <View style={styles.rawSensorPanel}>
          <Text style={styles.rawSensorTitle}>Raw IMU stream</Text>
          <Text style={styles.rawSensorText}>
            ACC  X {imuData.accelerometer.x.toFixed(3)}  Y {imuData.accelerometer.y.toFixed(3)}  Z {imuData.accelerometer.z.toFixed(3)}
          </Text>
          <Text style={styles.rawSensorText}>
            GYRO X {imuData.gyroscope.x.toFixed(3)}  Y {imuData.gyroscope.y.toFixed(3)}  Z {imuData.gyroscope.z.toFixed(3)}
          </Text>
        </View>
      </SectionCard>


      {/* SESSION CONTROL */}

      {
        monitoringActive.current &&
        calibrationResult !== null &&
        calibrationResult.valid &&
        session !== null && (
        <View style={styles.sessionControlCard}>
          <View style={styles.flexOne}>
            <Text style={styles.sessionControlTitle}>Monitoring session active</Text>
            <Text style={styles.sessionControlBody}>
              {session.samples.length} samples · {session.feedbackEvents.length} feedback events
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.stopButton, pressed && styles.buttonPressed]}
            onPress={stopMonitoring}
          >
            <Text style={styles.stopButtonText}>Stop Monitoring</Text>
          </Pressable>
        </View>
        )
      }

        </>
      )}


      {/* =================================
          PERFORMANCE METRICS
      ================================= */}

      {
        activeView === 'results' &&
        displayedResult !== null && (

          <SessionResultsDashboard
            session={displayedResult}
            metrics={displayedResult.metrics}
            uploadState={historicalSessionDetail === null ? sessionUploadState : 'saved'}
            adaptiveMode={adaptiveThresholdController.getMode()}
            canonicalPitchThreshold={
              MINIMUM_THRESHOLD +
              VARIABILITY_FACTOR * displayedResult.calibration.pitchStd
            }
            canonicalRollThreshold={
              MINIMUM_THRESHOLD +
              VARIABILITY_FACTOR * displayedResult.calibration.rollStd
            }
            onRetryUpload={retrySessionUpload}
            onStartNewSession={startMonitoring}
            canStartNewSession={
              calibrated &&
              !sessionUploadActiveRef.current &&
              pendingUploadSessionRef.current === null
            }
          />

        )
      }




      {/* =================================
          HISTORICAL ANALYTICS
      ================================= */}

      {
        activeView === 'history' &&
        !isCalibrating && (

          <HistoricalAnalyticsDashboard
            summary={historicalSummary}
            trends={historicalTrends}
            loading={historicalLoading}
            error={historicalError}
            adaptiveMode={adaptiveThresholdController.getMode()}
            onRefresh={() => {
              void loadHistoricalAnalytics();
            }}
            onOpenSession={(id) => {
              void openHistoricalSession(id);
            }}
            sessionDetailLoading={historicalSessionLoading}
            sessionDetailError={historicalSessionError}
          />

        )
      }


      {/* =================================
          CALIBRATION
      ================================= */}

      {activeView === 'monitor' && (
      <View style={styles.calibrationCard}>

        <View style={styles.calibrationHeader}>
          <View style={styles.flexOne}>
            <Text style={styles.heading}>
              Personalized Calibration
            </Text>
            <Text style={styles.calibrationCaption}>
              Establishes your natural comfortable upright baseline.
            </Text>
          </View>
          <View style={[
            styles.calibrationBadge,
            calibrated
              ? styles.calibrationBadgeReady
              : isCalibrating
                ? styles.calibrationBadgeActive
                : styles.calibrationBadgeNeutral,
          ]}>
            <Text style={styles.calibrationBadgeText}>
              {monitoring
                ? 'MONITORING'
                : calibrated
                  ? 'CALIBRATED — READY'
                  : isCalibrating
                    ? 'CALIBRATING'
                    : 'CALIBRATION REQUIRED'}
            </Text>
          </View>
        </View>


        {/* ---------------------------------
            BEFORE CALIBRATION
        --------------------------------- */}

        {
          !isCalibrating &&
          calibrationResult === null && (

            <>

              <Text style={styles.instruction}>
                Wear the phone securely on your
                torso.
              </Text>


              <Text style={styles.instruction}>
                Maintain your natural comfortable
                upright posture.
              </Text>


              <Text style={styles.instruction}>
                Do not force yourself to straighten.
              </Text>


              <Pressable
                style={styles.button}
                onPress={startCalibration}
              >

                <Text style={styles.buttonText}>
                  Start Calibration
                </Text>

              </Pressable>

            </>

          )
        }


        {/* ---------------------------------
            CALIBRATION RUNNING
        --------------------------------- */}

        {
          isCalibrating && (

            <>

              <Text style={styles.calibrating}>
                CALIBRATING...
              </Text>


              <Text style={styles.timer}>
                {calibrationTime.toFixed(1)}
                {' / '}
                {CALIBRATION_DURATION}
                {' seconds'}
              </Text>


              <Text style={styles.instruction}>
                Maintain your natural posture.
              </Text>


              <Text style={styles.instruction}>
                Try to remain reasonably still.
              </Text>

            </>

          )
        }


        {/* ---------------------------------
            CALIBRATION RESULT
        --------------------------------- */}

        {
          !isCalibrating &&
          calibrationResult !== null && (

            <>

              <Text style={styles.resultTitle}>

                {
                  calibrationResult.valid
                    ? 'CALIBRATION COMPLETE'
                    : 'CALIBRATION NOT RELIABLE'
                }

              </Text>


              <Text style={styles.result}>
                Neutral Pitch:{' '}

                {
                  calibrationResult
                    .pitchBaseline
                    .toFixed(2)
                }°

              </Text>


              <Text style={styles.result}>
                Neutral Roll:{' '}

                {
                  calibrationResult
                    .rollBaseline
                    .toFixed(2)
                }°

              </Text>


              <Text style={styles.result}>
                Pitch Variability:{' '}

                {
                  calibrationResult
                    .pitchStd
                    .toFixed(2)
                }°

              </Text>


              <Text style={styles.result}>
                Roll Variability:{' '}

                {
                  calibrationResult
                    .rollStd
                    .toFixed(2)
                }°

              </Text>


              <Text style={styles.result}>
                Confidence:{' '}

                {
                  calibrationResult
                    .confidence
                    .toFixed(1)
                }%

              </Text>


              <Text style={styles.result}>
                Samples:{' '}

                {
                  calibrationResult
                    .sampleCount
                }

              </Text>


              <Text style={styles.result}>
                Duration:{' '}

                {
                  calibrationResult
                    .duration
                    .toFixed(1)
                }

                {' seconds'}

              </Text>


              {
                !calibrationResult.valid && (

                  <View style={styles.calibrationFailureCard}>
                    <Text style={styles.calibrationFailureTitle}>
                      Calibration could not be validated
                    </Text>
                    <Text style={styles.calibrationFailureBody}>
                      {formatCalibrationFailure(calibrationResult)}
                    </Text>
                    <Text style={styles.calibrationFailureInstruction}>
                      Secure the phone, remain comfortably upright, and stay reasonably still before trying again.
                    </Text>
                  </View>

                )
              }


              {
                calibrationResult.valid &&
                !monitoringActive.current &&
                pendingUploadSessionRef.current === null &&
                !sessionUploadActiveRef.current && (

                  <>

                    <Text style={styles.goodStatus}>
                      CALIBRATED — READY
                    </Text>

                    <Text style={styles.readyBody}>
                      Your valid calibration is retained. Start a fresh monitoring session when ready.
                    </Text>


                    <Pressable
                      style={styles.button}
                      onPress={startMonitoring}
                    >

                      <Text style={styles.buttonText}>
                        Start Monitoring
                      </Text>

                    </Pressable>

                  </>

                )
              }


              {
                calibrationResult.valid &&
                monitoringActive.current && (

                  <View style={styles.monitoringCalibrationNotice}>
                    <Text style={styles.monitoringCalibrationTitle}>
                      Calibration locked during monitoring
                    </Text>
                    <Text style={styles.monitoringCalibrationBody}>
                      Stop monitoring before recalibrating. Your current baseline remains active for this session.
                    </Text>
                  </View>

                )
              }


              {
                calibrationResult.valid &&
                !monitoringActive.current &&
                pendingUploadSessionRef.current !== null && (

                  <View style={styles.pendingSessionNotice}>
                    <Text style={styles.pendingSessionTitle}>
                      Complete the current session sync first
                    </Text>
                    <Text style={styles.pendingSessionBody}>
                      {sessionUploadState === 'uploading'
                        ? 'The finalized session is currently syncing. Its results remain available.'
                        : 'The finalized session is retained for retry. Open Session Results to retry sync.'}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={openLatestResult}
                      style={({ pressed }) => [styles.pendingSessionButton, pressed && styles.buttonPressed]}
                    >
                      <Text style={styles.pendingSessionButtonText}>View Session Results</Text>
                    </Pressable>
                  </View>

                )
              }


              {
                !monitoringActive.current &&
                pendingUploadSessionRef.current === null && (

                  <Pressable
                    style={styles.button}
                    onPress={startCalibration}
                  >

                      <Text style={styles.buttonText}>
                      {calibrationResult.valid ? 'Recalibrate' : 'Try Again'}
                      </Text>

                  </Pressable>

                )
              }

            </>

          )
        }

      </View>
      )}


      {/* =================================
          SYSTEM STATUS
      ================================= */}

      <View style={styles.statusCard}>

        <Text style={styles.status}>
          PJT-I Engineering Review Build
        </Text>


        <Text style={styles.frequency}>
          Adaptive timing mode: {adaptiveThresholdController.getMode()}
        </Text>

      </View>


      <StatusBar style="auto" />

    </ScrollView>

  );
}


// =====================================
// DASHBOARD PRESENTATION COMPONENTS
// =====================================

type StatusTone =
  | 'neutral'
  | 'good'
  | 'active'
  | 'warning';

function NavigationButton({
  label,
  active,
  disabled = false,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navigationButton,
        active && styles.navigationButtonActive,
        disabled && styles.navigationButtonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={[
        styles.navigationButtonText,
        active && styles.navigationButtonTextActive,
      ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function formatCalibrationFailure(result: CalibrationResult): string {
  if (result.reason === 'Not enough samples') {
    return `Only ${result.sampleCount} samples were recorded; at least 100 are required.`;
  }

  if (result.reason === 'Too much movement during calibration') {
    const unstableAxes: string[] = [];

    if (result.pitchStd > 4) {
      unstableAxes.push(`pitch variability was ${result.pitchStd.toFixed(2)}°`);
    }

    if (result.rollStd > 4) {
      unstableAxes.push(`roll variability was ${result.rollStd.toFixed(2)}°`);
    }

    return unstableAxes.length > 0
      ? `Too much movement was detected: ${unstableAxes.join(' and ')}. The engineering limit is 4.00° per axis.`
      : 'Too much movement was detected during calibration.';
  }

  return result.reason ?? 'The calibration result was not valid.';
}

function formatSessionStorageState(state: SessionUploadState): string {
  switch (state) {
    case 'uploading': return 'SYNCING';
    case 'saved': return 'SYNCED';
    case 'failed': return 'SYNC UNAVAILABLE';
    case 'possibly-saved': return 'MAY ALREADY BE SYNCED';
    case 'idle': return 'LOCAL';
  }
}

function SectionCard({
  title,
  caption,
  accessory,
  children,
}: {
  title: string;
  caption?: string;
  accessory?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.flexOne}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {caption ? <Text style={styles.sectionCaption}>{caption}</Text> : null}
        </View>
        {accessory}
      </View>
      {children}
    </View>
  );
}

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: StatusTone;
}) {
  const toneStyle =
    tone === 'good'
      ? styles.statusPillGood
      : tone === 'active'
        ? styles.statusPillActive
        : tone === 'warning'
          ? styles.statusPillWarning
          : styles.statusPillNeutral;

  return (
    <View style={[styles.statusPill, toneStyle]}>
      <Text style={styles.statusPillLabel}>{label}</Text>
      <Text style={styles.statusPillValue}>{value}</Text>
    </View>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroMetric}>
      <Text style={styles.heroMetricLabel}>{label}</Text>
      <Text style={styles.heroMetricValue}>{value}</Text>
    </View>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.compactMetric}>
      <Text style={styles.compactMetricLabel}>{label}</Text>
      <Text style={styles.compactMetricValue}>{value}</Text>
    </View>
  );
}

function ProgressBar({ value, warning = false }: { value: number; warning?: boolean }) {
  const boundedValue = Math.max(0, Math.min(1, value));

  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          warning && styles.progressFillWarning,
          { width: `${boundedValue * 100}%` },
        ]}
      />
    </View>
  );
}

function SignalPanel({
  title,
  status,
  active,
  warning = false,
  children,
}: {
  title: string;
  status: string;
  active: boolean;
  warning?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.signalPanel}>
      <View style={styles.signalHeader}>
        <Text style={styles.signalTitle}>{title}</Text>
        <View style={[
          styles.signalStatus,
          active
            ? styles.signalStatusGood
            : warning
              ? styles.signalStatusWarning
              : styles.signalStatusNeutral,
        ]}>
          <Text style={styles.signalStatusText}>{status}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function AxisDeviationPanel({
  axis,
  deviation,
  canonicalThreshold,
  effectiveThreshold,
  adjustment,
  outside,
  available,
}: {
  axis: string;
  deviation: number | null;
  canonicalThreshold: number | null;
  effectiveThreshold: number | null;
  adjustment: number;
  outside: boolean;
  available: boolean;
}) {
  return (
    <View style={styles.axisPanel}>
      <View style={styles.axisHeader}>
        <Text style={styles.axisTitle}>{axis}</Text>
        <View style={[styles.axisState, outside && available ? styles.axisStateOutside : styles.axisStateInside]}>
          <Text style={styles.axisStateText}>
            {!available ? 'WAITING' : outside ? 'OUTSIDE' : 'WITHIN'}
          </Text>
        </View>
      </View>
      <Text style={styles.axisDeviationValue}>
        {deviation === null ? '—' : `${deviation.toFixed(2)}°`}
      </Text>
      <Text style={styles.axisDeviationLabel}>current absolute deviation</Text>
      <View style={styles.thresholdStack}>
        <MetricRow
          label="Canonical threshold"
          value={canonicalThreshold === null ? '—' : `${canonicalThreshold.toFixed(2)}°`}
        />
        <MetricRow label="Adaptive adjustment" value={`+${adjustment.toFixed(2)}°`} />
        <MetricRow
          label="Effective threshold"
          value={effectiveThreshold === null ? '—' : `${effectiveThreshold.toFixed(2)}°`}
        />
      </View>
    </View>
  );
}

function FeatureGauge({
  label,
  value,
  shortTerm,
  longTerm,
}: {
  label: string;
  value: number;
  shortTerm: number;
  longTerm: number;
}) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureLabelRow}>
        <Text style={styles.featureLabel}>{label}</Text>
        <Text style={styles.featureValue}>{value.toFixed(2)}</Text>
      </View>
      <ProgressBar value={value} />
      <Text style={styles.featureEmaText}>
        Short EMA {shortTerm.toFixed(2)}  ·  Long EMA {longTerm.toFixed(2)}
      </Text>
    </View>
  );
}

function SafetyGate({ label, allowing }: { label: string; allowing: boolean }) {
  return (
    <View style={[styles.safetyGate, allowing ? styles.safetyGateAllow : styles.safetyGateBlock]}>
      <View style={[styles.safetyDot, allowing ? styles.safetyDotAllow : styles.safetyDotBlock]} />
      <Text style={styles.safetyGateLabel}>{label}</Text>
      <Text style={styles.safetyGateValue}>{allowing ? 'ALLOW' : 'BLOCK'}</Text>
    </View>
  );
}

function AdaptiveAxisPanel({
  axis,
  diagnostics,
  adjustment,
  canonicalThreshold,
  effectiveThreshold,
}: {
  axis: string;
  diagnostics: AxisAdaptiveThresholdDiagnostics;
  adjustment: number;
  canonicalThreshold: number | null;
  effectiveThreshold: number | null;
}) {
  const { features, featureEmaValues } = diagnostics;
  const freezeReasons = getAdaptiveFreezeReasons(diagnostics);

  return (
    <View style={styles.adaptiveAxisPanel}>
      <View style={styles.adaptiveAxisHeader}>
        <Text style={styles.adaptiveAxisTitle}>{axis} axis</Text>
        <Text style={styles.adaptiveAxisAdjustment}>+{adjustment.toFixed(2)}° adjustment</Text>
      </View>

      <Text style={styles.subsectionLabel}>NORMALIZED BEHAVIORAL FEATURES · 0–1</Text>
      <FeatureGauge label="Deviation trend" value={features.deviationTrend} {...featureEmaValues.deviation} />
      <FeatureGauge label="Deviation frequency" value={features.deviationFrequency} {...featureEmaValues.frequency} />
      <FeatureGauge label="Correction-response trend" value={features.correctionTrend} {...featureEmaValues.correction} />
      <FeatureGauge label="Good-posture duration decline" value={features.goodPostureDecline} {...featureEmaValues.goodPostureDuration} />
      <FeatureGauge label="Near-threshold exposure" value={features.nearThresholdExposure} {...featureEmaValues.nearThreshold} />

      <View style={styles.evidencePanel}>
        <CompactMetric label="Combined evidence" value={diagnostics.combinedEvidence.toFixed(2)} />
        <CompactMetric label="Evidence EMA" value={diagnostics.evidenceEma.toFixed(2)} />
        <CompactMetric label="Canonical threshold" value={canonicalThreshold === null ? '—' : `${canonicalThreshold.toFixed(2)}°`} />
        <CompactMetric label="Effective threshold" value={effectiveThreshold === null ? '—' : `${effectiveThreshold.toFixed(2)}°`} />
      </View>

      <Text style={styles.subsectionLabel}>SAFETY GATES</Text>
      <View style={styles.safetyGrid}>
        <SafetyGate label="Sufficient data" allowing={diagnostics.dataSufficient} />
        <SafetyGate label="Stable posture" allowing={!diagnostics.unstable} />
        <SafetyGate label="Severe-deviation veto clear" allowing={!diagnostics.severeDeviation} />
        <SafetyGate label="Major-deterioration veto clear" allowing={!diagnostics.majorDeterioration} />
      </View>
      <Text style={freezeReasons.length > 0 ? styles.freezeWarning : styles.freezeReady}>
        {freezeReasons.length > 0
          ? `Adaptation frozen: ${freezeReasons.join(', ')}.`
          : 'Safety gates allow bounded adaptation from behavioral evidence.'}
      </Text>
    </View>
  );
}

function getAdaptiveFreezeReasons(
  diagnostics: AxisAdaptiveThresholdDiagnostics
): string[] {
  const reasons: string[] = [];
  if (!diagnostics.dataSufficient) reasons.push('insufficient data');
  if (diagnostics.unstable) reasons.push('unstable posture');
  if (diagnostics.severeDeviation) reasons.push('severe deviation');
  if (diagnostics.majorDeterioration) reasons.push('major deterioration');
  return reasons;
}

function formatDirection(direction: PostureDirection | null): string {
  if (direction === null) return 'None';
  return direction.charAt(0).toUpperCase() + direction.slice(1);
}

function formatTimestamp(timestamp: number | null): string {
  if (timestamp === null) return '—';
  return `${(timestamp / 1000).toFixed(2)} s`;
}

function formatDuration(duration: number): string {
  const totalSeconds = Math.max(0, Math.floor(duration / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function clampDisplayOffset(pitch: number): number {
  return Math.max(-18, Math.min(18, pitch - 90));
}

function clampDisplayAngle(roll: number): number {
  return Math.max(-25, Math.min(25, roll));
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


// =======================================
// STYLES
// =======================================

const styles = StyleSheet.create({

  container: {
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 48,
    backgroundColor: '#F3F6F9',
  },

  navigationBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE5EC',
    padding: 4,
    marginBottom: 14,
    gap: 4,
  },

  navigationButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },

  navigationButtonActive: {
    backgroundColor: '#173F67',
  },

  navigationButtonDisabled: {
    opacity: 0.38,
  },

  navigationButtonText: {
    color: '#526476',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },

  navigationButtonTextActive: {
    color: '#FFFFFF',
  },


  title: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '800',
    color: '#132238',
  },


  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },


  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E4EAF0',
  },


  calibrationCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E4EAF0',
  },

  calibrationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
  },

  calibrationCaption: {
    color: '#657486',
    fontSize: 12,
    lineHeight: 17,
  },

  calibrationBadge: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    maxWidth: 126,
  },

  calibrationBadgeReady: {
    backgroundColor: '#DDF1EA',
  },

  calibrationBadgeActive: {
    backgroundColor: '#DDEAF5',
  },

  calibrationBadgeNeutral: {
    backgroundColor: '#EDF1F4',
  },

  calibrationBadgeText: {
    color: '#28465F',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    textAlign: 'center',
  },

  calibrationFailureCard: {
    backgroundColor: '#FFF3EF',
    borderColor: '#EDC8BC',
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    marginTop: 10,
  },

  calibrationFailureTitle: {
    color: '#8E3F2D',
    fontSize: 14,
    fontWeight: '800',
  },

  calibrationFailureBody: {
    color: '#7A5148',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },

  calibrationFailureInstruction: {
    color: '#684B44',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    marginTop: 8,
  },

  readyBody: {
    color: '#4F6F66',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },

  monitoringCalibrationNotice: {
    backgroundColor: '#EDF4FA',
    borderColor: '#C8DBEC',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },

  monitoringCalibrationTitle: {
    color: '#234F73',
    fontSize: 13,
    fontWeight: '800',
  },

  monitoringCalibrationBody: {
    color: '#557086',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },

  pendingSessionNotice: {
    backgroundColor: '#FFF7E8',
    borderColor: '#E8D3A8',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },

  pendingSessionTitle: {
    color: '#76501F',
    fontSize: 13,
    fontWeight: '800',
  },

  pendingSessionBody: {
    color: '#766044',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },

  pendingSessionButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#76501F',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },

  pendingSessionButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },


  heading: {
    fontSize: 19,
    fontWeight: '700',
    color: '#132238',
    marginBottom: 12,
  },


  value: {
    fontSize: 18,
    fontFamily: 'monospace',
    marginVertical: 3,
  },


  orientation: {
    fontSize: 22,
    fontWeight: '600',
    marginVertical: 5,
  },


  instruction: {
    fontSize: 15,
    color: '#555',
    marginBottom: 8,
  },


  button: {
    backgroundColor: '#173F67',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 12,
    alignItems: 'center',
  },


  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },


  calibrating: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
  },


  timer: {
    fontSize: 26,
    fontWeight: '600',
    marginBottom: 12,
  },


  resultTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#132238',
  },


  result: {
    fontSize: 15,
    color: '#34465A',
    marginVertical: 3,
  },


  warning: {
    fontSize: 15,
    marginTop: 10,
    color: '#9C3D29',
  },


  goodStatus: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 15,
    color: '#16705A',
  },


  warningStatus: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 15,
    color: '#B55235',
  },


  statusCard: {
    alignItems: 'center',
    marginTop: 5,
    marginBottom: 30,
  },


  status: {
    fontSize: 16,
    fontWeight: '600',
  },


  frequency: {
    color: '#666',
    marginTop: 5,
  },

  flexOne: {
    flex: 1,
  },

  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },

  brandMark: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#173F67',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },

  brandMarkText: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '900',
  },

  brandCopy: {
    flex: 1,
  },

  eyebrow: {
    color: '#4B6C8F',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
    marginBottom: 2,
  },

  headerStatusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },

  statusPill: {
    minWidth: 104,
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },

  statusPillNeutral: {
    backgroundColor: '#F7F9FB',
    borderColor: '#DCE4EC',
  },

  statusPillGood: {
    backgroundColor: '#EDF8F4',
    borderColor: '#B9E0D3',
  },

  statusPillActive: {
    backgroundColor: '#EDF4FB',
    borderColor: '#BED4E8',
  },

  statusPillWarning: {
    backgroundColor: '#FFF5E8',
    borderColor: '#EECDA3',
  },

  statusPillLabel: {
    color: '#687A8D',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  statusPillValue: {
    color: '#18324B',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },

  demoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 14,
    backgroundColor: '#FFF7E8',
    borderWidth: 1,
    borderColor: '#E8C77E',
    padding: 13,
    marginBottom: 14,
  },

  demoDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#D48A17',
    marginTop: 4,
    marginRight: 10,
  },

  demoTitle: {
    color: '#704A0C',
    fontSize: 13,
    fontWeight: '800',
  },

  demoBody: {
    color: '#826329',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },

  heroCard: {
    borderRadius: 22,
    padding: 22,
    marginBottom: 14,
    borderWidth: 1,
  },

  heroGood: {
    backgroundColor: '#0E5C4C',
    borderColor: '#0E5C4C',
  },

  heroWarning: {
    backgroundColor: '#8A3E2C',
    borderColor: '#8A3E2C',
  },

  heroNeutral: {
    backgroundColor: '#18324B',
    borderColor: '#18324B',
  },

  heroLabel: {
    color: '#CFE0EA',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  heroState: {
    color: '#FFFFFF',
    fontSize: 31,
    fontWeight: '900',
    marginTop: 5,
  },

  heroDirection: {
    color: '#E3EDF3',
    fontSize: 14,
    marginTop: 4,
  },

  heroMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 17,
  },

  heroMetric: {
    flex: 1,
  },

  heroMetricLabel: {
    color: '#CFE0EA',
    fontSize: 12,
    fontWeight: '700',
  },

  heroMetricValue: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '800',
    marginTop: 2,
  },

  heroDivider: {
    width: 1,
    height: 42,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 18,
  },

  heroExplanation: {
    color: '#E3EDF3',
    fontSize: 13,
    lineHeight: 19,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
    paddingTop: 14,
  },

  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E0E7EE',
    elevation: 1,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },

  sectionTitle: {
    color: '#132238',
    fontSize: 19,
    fontWeight: '800',
  },

  sectionCaption: {
    color: '#6A7A8C',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    paddingRight: 8,
  },

  orientationLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },

  orientationVisual: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: '#F2F6FA',
    borderWidth: 1,
    borderColor: '#D8E2EB',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  orientationCrossHorizontal: {
    position: 'absolute',
    width: 88,
    height: 1,
    backgroundColor: '#D4DEE7',
  },

  orientationCrossVertical: {
    position: 'absolute',
    width: 1,
    height: 88,
    backgroundColor: '#D4DEE7',
  },

  orientationIndicator: {
    width: 78,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#173F67',
    alignItems: 'center',
    justifyContent: 'center',
  },

  orientationIndicatorLine: {
    width: 46,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#8CD5C4',
  },

  orientationValues: {
    flex: 1,
  },

  subtlePanel: {
    backgroundColor: '#F7F9FB',
    borderRadius: 12,
    padding: 13,
    marginTop: 14,
  },

  subtlePanelTitle: {
    color: '#41566B',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 8,
  },

  twoColumnMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  compactMetric: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 126,
    backgroundColor: '#F7F9FB',
    borderRadius: 10,
    padding: 11,
  },

  compactMetricLabel: {
    color: '#748394',
    fontSize: 11,
    fontWeight: '600',
  },

  compactMetricValue: {
    color: '#19334D',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 3,
  },

  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
    paddingVertical: 4,
  },

  metricLabel: {
    color: '#718092',
    fontSize: 12,
    flex: 1,
  },

  metricValue: {
    color: '#1B344D',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },

  axisGrid: {
    gap: 10,
  },

  axisPanel: {
    backgroundColor: '#F7F9FB',
    borderRadius: 13,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5EBF0',
  },

  axisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  axisTitle: {
    color: '#19334D',
    fontSize: 15,
    fontWeight: '800',
  },

  axisState: {
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },

  axisStateInside: {
    backgroundColor: '#DDEFE9',
  },

  axisStateOutside: {
    backgroundColor: '#F7DDD5',
  },

  axisStateText: {
    color: '#344A5F',
    fontSize: 10,
    fontWeight: '800',
  },

  axisDeviationValue: {
    color: '#132238',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 10,
  },

  axisDeviationLabel: {
    color: '#718092',
    fontSize: 11,
    marginBottom: 10,
  },

  thresholdStack: {
    borderTopWidth: 1,
    borderTopColor: '#E1E8EE',
    paddingTop: 8,
  },

  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 7,
    marginTop: 12,
  },

  legendSwatch: {
    width: 14,
    height: 3,
    borderRadius: 2,
  },

  canonicalSwatch: {
    backgroundColor: '#8292A3',
  },

  effectiveSwatch: {
    backgroundColor: '#217A68',
  },

  legendText: {
    color: '#6C7C8D',
    fontSize: 10,
    marginRight: 5,
  },

  deviationSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },

  signalGrid: {
    gap: 10,
  },

  signalPanel: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E3E9EF',
    padding: 14,
  },

  signalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  signalTitle: {
    color: '#1A334C',
    fontSize: 15,
    fontWeight: '800',
  },

  signalStatus: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  signalStatusGood: {
    backgroundColor: '#DDEFE9',
  },

  signalStatusWarning: {
    backgroundColor: '#FFF0D9',
  },

  signalStatusNeutral: {
    backgroundColor: '#EDF1F5',
  },

  signalStatusText: {
    color: '#344A5F',
    fontSize: 10,
    fontWeight: '800',
  },

  progressLabel: {
    color: '#718092',
    fontSize: 11,
    marginTop: 9,
    marginBottom: 6,
  },

  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: '#E7EDF2',
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#287B69',
  },

  progressFillWarning: {
    backgroundColor: '#D27B2C',
  },

  microcopy: {
    color: '#728294',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },

  feedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },

  fieldLabel: {
    color: '#718092',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  feedbackActive: {
    color: '#B34A31',
    fontSize: 23,
    fontWeight: '900',
    marginTop: 2,
  },

  feedbackInactive: {
    color: '#1B705D',
    fontSize: 23,
    fontWeight: '900',
    marginTop: 2,
  },

  emptyText: {
    color: '#758597',
    fontSize: 12,
  },

  modeBadge: {
    backgroundColor: '#FFF0CE',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  modeBadgeText: {
    color: '#7C570F',
    fontSize: 10,
    fontWeight: '900',
  },

  adaptiveAxisPanel: {
    borderTopWidth: 1,
    borderTopColor: '#E4EAF0',
    paddingTop: 14,
    marginTop: 4,
    marginBottom: 20,
  },

  adaptiveAxisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 13,
  },

  adaptiveAxisTitle: {
    color: '#17324B',
    fontSize: 16,
    fontWeight: '900',
  },

  adaptiveAxisAdjustment: {
    color: '#246B5D',
    fontSize: 12,
    fontWeight: '800',
  },

  subsectionLabel: {
    color: '#687A8D',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: 9,
    marginTop: 3,
  },

  featureRow: {
    marginBottom: 12,
  },

  featureLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },

  featureLabel: {
    color: '#344B61',
    fontSize: 12,
    fontWeight: '700',
  },

  featureValue: {
    color: '#173F67',
    fontSize: 12,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },

  featureEmaText: {
    color: '#8090A0',
    fontSize: 10,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },

  evidencePanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 5,
    marginBottom: 16,
  },

  safetyGrid: {
    gap: 7,
  },

  safetyGate: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
  },

  safetyGateAllow: {
    backgroundColor: '#F0F8F5',
    borderColor: '#CEE7DE',
  },

  safetyGateBlock: {
    backgroundColor: '#FFF4EF',
    borderColor: '#F0D4C9',
  },

  safetyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 8,
  },

  safetyDotAllow: {
    backgroundColor: '#287B69',
  },

  safetyDotBlock: {
    backgroundColor: '#C45B40',
  },

  safetyGateLabel: {
    flex: 1,
    color: '#344B61',
    fontSize: 12,
    fontWeight: '700',
  },

  safetyGateValue: {
    color: '#536779',
    fontSize: 10,
    fontWeight: '900',
  },

  freezeWarning: {
    color: '#9B432F',
    backgroundColor: '#FFF2ED',
    borderRadius: 9,
    padding: 10,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 9,
  },

  freezeReady: {
    color: '#1F6758',
    backgroundColor: '#EEF8F4',
    borderRadius: 9,
    padding: 10,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 9,
  },

  adaptationSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  runtimeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  rawSensorPanel: {
    backgroundColor: '#152A3E',
    borderRadius: 12,
    padding: 13,
    marginTop: 12,
  },

  rawSensorText: {
    color: '#C7D6E3',
    fontSize: 11,
    lineHeight: 18,
    fontFamily: 'monospace',
  },

  rawSensorTitle: {
    color: '#E4EDF4',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 8,
  },

  sessionControlCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#EAF2F8',
    borderWidth: 1,
    borderColor: '#C9DCEB',
    borderRadius: 16,
    padding: 15,
    marginBottom: 14,
  },

  sessionControlTitle: {
    color: '#17344E',
    fontSize: 14,
    fontWeight: '800',
  },

  sessionControlBody: {
    color: '#637789',
    fontSize: 11,
    marginTop: 3,
  },

  stopButton: {
    backgroundColor: '#9E412E',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },

  stopButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  buttonPressed: {
    opacity: 0.8,
  },

});
