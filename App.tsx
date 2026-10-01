import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
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

import { uploadSession } from './services/apiService';


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

const hapticService =
  new HapticService();

const correctionResponseDetector =
  new CorrectionResponseDetector();


// =====================================
// CONFIGURATION
// =====================================

const CALIBRATION_DURATION = 30;

// Initial experimental values.
// These are NOT medical thresholds.
const MINIMUM_THRESHOLD = 4;
const VARIABILITY_FACTOR = 2;


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
          // Create monitoring session
          // ---------------------------------

          if (
            result.valid
          ) {

            const newSession =
              startSession(result);

            sessionRef.current =
              newSession;

            setSession(
              newSession
            );

            /*
             * Monitoring begins after
             * successful calibration.
             */

            monitoringActive.current =
              true;

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
            data.timestamp
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

          hapticService.stop();

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

      lastTimestamp.current =
        null;

    };

  }, []);


  // =====================================
  // START CALIBRATION
  // =====================================

  const startCalibration = () => {

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


    // ---------------------------------
    // Reset correction event tracking
    // ---------------------------------

    previousCorrectionFeedbackTimestamp.current =
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
  };


  // =====================================
  // STOP MONITORING
  // =====================================

  const stopMonitoring = () => {

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
      currentSession === null ||
      currentSession.startTime === 0
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

    uploadSession(
      completedSession,
      metrics
    )
      .then(() => {

        console.log(
          'Session successfully saved to backend'
        );

      })
      .catch((error) => {

        console.error(
          'Session upload failed:',
          error
        );

      });


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

    setFeedback(
      null
    );


    previousCorrectionFeedbackTimestamp.current =
      null;

  };


  // =====================================
  // UI
  // =====================================

  return (

    <ScrollView
      contentContainerStyle={
        styles.container
      }
    >

      {/* =================================
          HEADER
      ================================= */}

      <Text style={styles.title}>
        POSTURE BELT
      </Text>


      <Text style={styles.subtitle}>
        Personalized Adaptive Posture System
      </Text>


      {/* =================================
          ACCELEROMETER
      ================================= */}

      <View style={styles.card}>

        <Text style={styles.heading}>
          Accelerometer
        </Text>


        <Text style={styles.value}>
          X: {imuData.accelerometer.x.toFixed(4)}
        </Text>


        <Text style={styles.value}>
          Y: {imuData.accelerometer.y.toFixed(4)}
        </Text>


        <Text style={styles.value}>
          Z: {imuData.accelerometer.z.toFixed(4)}
        </Text>

      </View>


      {/* =================================
          GYROSCOPE
      ================================= */}

      <View style={styles.card}>

        <Text style={styles.heading}>
          Gyroscope
        </Text>


        <Text style={styles.value}>
          X: {imuData.gyroscope.x.toFixed(4)}
        </Text>


        <Text style={styles.value}>
          Y: {imuData.gyroscope.y.toFixed(4)}
        </Text>


        <Text style={styles.value}>
          Z: {imuData.gyroscope.z.toFixed(4)}
        </Text>

      </View>


      {/* =================================
          BODY ORIENTATION
      ================================= */}

      <View style={styles.card}>

        <Text style={styles.heading}>
          Body Orientation
        </Text>


        <Text style={styles.orientation}>
          Pitch: {pitch.toFixed(2)}°
        </Text>


        <Text style={styles.orientation}>
          Roll: {roll.toFixed(2)}°
        </Text>

      </View>


      {/* =================================
          PERSONALIZED DEVIATION
      ================================= */}

      {
        calibrationResult !== null &&
        calibrationResult.valid &&
        deviation !== null && (

          <View style={styles.card}>

            <Text style={styles.heading}>
              Personalized Deviation
            </Text>


            <Text style={styles.result}>
              Pitch Deviation:{' '}
              {deviation.pitchDeviation.toFixed(2)}°
            </Text>


            <Text style={styles.result}>
              Pitch Threshold:{' '}
              {deviation.pitchThreshold.toFixed(2)}°
            </Text>


            <Text style={styles.result}>
              Roll Deviation:{' '}
              {deviation.rollDeviation.toFixed(2)}°
            </Text>


            <Text style={styles.result}>
              Roll Threshold:{' '}
              {deviation.rollThreshold.toFixed(2)}°
            </Text>


            <Text
              style={
                deviation.overallDeviation
                  ? styles.warningStatus
                  : styles.goodStatus
              }
            >

              {
                deviation.overallDeviation
                  ? '⚠ POSTURE DEVIATION'
                  : '✓ POSTURE ACCEPTABLE'
              }

            </Text>

          </View>

        )
      }


      {/* ============================
          STABILITY UI CARD
      ============================== */}

      {
        calibrationResult !== null &&
        calibrationResult.valid &&
        stability !== null && (

          <View style={styles.card}>

            <Text style={styles.heading}>
              Posture Stability
            </Text>


            <Text style={styles.result}>
              Pitch Variability:{' '}
              {stability.pitchStd.toFixed(2)}°
            </Text>


            <Text style={styles.result}>
              Roll Variability:{' '}
              {stability.rollStd.toFixed(2)}°
            </Text>


            <Text style={styles.result}>
              Samples:{' '}
              {stability.sampleCount}
            </Text>


            <Text style={styles.result}>
              Window:{' '}
              {stability.windowDuration.toFixed(1)}
              {' seconds'}
            </Text>


            <Text
              style={
                stability.stable
                  ? styles.goodStatus
                  : styles.warningStatus
              }
            >

              {
                stability.stable
                  ? '✓ POSTURE STABLE'
                  : '⚠ POSTURE MOVEMENT'
              }

            </Text>

          </View>

        )
      }


      {/* ============================
          PERSISTENCE UI CARD
      ============================== */}

      {
        calibrationResult !== null &&
        calibrationResult.valid &&
        persistence !== null && (

          <View style={styles.card}>

            <Text style={styles.heading}>
              Deviation Persistence
            </Text>


            <Text style={styles.result}>
              Outside Duration:{' '}
              {persistence.elapsedOutside.toFixed(1)}
              {' seconds'}
            </Text>


            <Text
              style={
                persistence.isSustained
                  ? styles.warningStatus
                  : styles.goodStatus
              }
            >

              {
                persistence.isSustained
                  ? '⚠ SUSTAINED DEVIATION'
                  : 'MONITORING DEVIATION'
              }

            </Text>

          </View>

        )
      }


      {/* =================================
          FEEDBACK UI CARD
      ===================================== */}

      {
        calibrationResult !== null &&
        calibrationResult.valid &&
        feedback !== null && (

          <View style={styles.card}>

            <Text style={styles.heading}>
              Feedback Controller
            </Text>


            <Text
              style={
                feedback.shouldVibrate
                  ? styles.warningStatus
                  : styles.goodStatus
              }
            >

              {
                feedback.shouldVibrate
                  ? '● FEEDBACK TRIGGERED'
                  : '● NO FEEDBACK'
              }

            </Text>


            {
              feedback.shouldVibrate && (

                <Text style={styles.result}>

                  Vibration:{' '}
                  {feedback.vibrationDuration}
                  {' ms'}

                </Text>

              )
            }

          </View>

        )
      }


      {/* =================================
          CORRECTION RESPONSE
      ================================= */}

      {
        calibrationResult !== null &&
        calibrationResult.valid &&
        correctionResponse !== null && (

          <View style={styles.card}>

            <Text style={styles.heading}>
              Correction Response
            </Text>


            {/* =============================
                WAITING
            ============================== */}

            {
              correctionResponse.status ===
              'WAITING' && (

                <Text style={styles.result}>
                  Waiting for feedback...
                </Text>

              )
            }


            {/* =============================
                OBSERVING
            ============================== */}

            {
              correctionResponse.status ===
              'OBSERVING' && (

                <>

                  <Text style={styles.result}>
                    Initial Deviation:{' '}

                    {
                      correctionResponse
                        .initialDeviation
                        .toFixed(2)
                    }°

                  </Text>


                  <Text style={styles.result}>
                    Current Deviation:{' '}

                    {
                      correctionResponse
                        .currentDeviation
                        .toFixed(2)
                    }°

                  </Text>


                  <Text style={styles.result}>
                    Response Time:{' '}

                    {
                      correctionResponse
                        .elapsedTime
                        .toFixed(1)
                    }

                    {' sec'}

                  </Text>


                  <Text style={styles.warningStatus}>
                    ⚠ CORRECTION REQUIRED
                  </Text>

                </>

              )
            }


            {/* =============================
                CORRECTED
            ============================== */}

            {
              correctionResponse.status ===
              'CORRECTED' && (

                <>

                  <Text style={styles.result}>
                    Initial Deviation:{' '}

                    {
                      correctionResponse
                        .initialDeviation
                        .toFixed(2)
                    }°

                  </Text>


                  <Text style={styles.result}>
                    Final Deviation:{' '}

                    {
                      correctionResponse
                        .currentDeviation
                        .toFixed(2)
                    }°

                  </Text>


                  <Text style={styles.result}>
                    Response Time:{' '}

                    {
                      correctionResponse
                        .responseTime
                        .toFixed(2)
                    }

                    {' sec'}

                  </Text>


                  <Text style={styles.goodStatus}>
                    ✓ CORRECTION DETECTED
                  </Text>

                </>

              )
            }

          </View>

        )
      }


      {/* =================================
          MONITORING SESSION
      ================================= */}

      {
        calibrationResult !== null &&
        calibrationResult.valid &&
        session !== null &&
        session.startTime !== 0 && (

          <View style={styles.card}>

            <Text style={styles.heading}>
              Monitoring Session
            </Text>


            <Text style={styles.result}>
              Samples:{' '}
              {session.samples.length}
            </Text>


            <Text style={styles.result}>
              Feedback Events:{' '}
              {session.feedbackEvents.length}
            </Text>


            <Pressable
              style={styles.button}
              onPress={stopMonitoring}
            >

              <Text style={styles.buttonText}>
                Stop Monitoring
              </Text>

            </Pressable>

          </View>

        )
      }


      {/* =================================
          PERFORMANCE METRICS
      ================================= */}

      {
        performanceMetrics !== null && (

          <View style={styles.card}>

            <Text style={styles.heading}>
              Performance Metrics
            </Text>


            <Text style={styles.result}>
              Consistency:{' '}
              {
                performanceMetrics
                  .consistency
                  .toFixed(1)
              }
              %
            </Text>


            <Text style={styles.result}>
              Average Correction Time:{' '}

              {
                performanceMetrics
                  .averageCorrectionTime ===
                  null

                  ? 'N/A'

                  : (
                    performanceMetrics
                      .averageCorrectionTime
                  ).toFixed(2) + ' sec'
              }

            </Text>


            <Text style={styles.result}>
              Monitoring Duration:{' '}

              {
                (
                  performanceMetrics.monitoredDuration /
                  1000
                ).toFixed(1)
              }

              {' sec'}

            </Text>


            <Text style={styles.result}>
              Samples:{' '}
              {
                performanceMetrics.sampleCount
              }
            </Text>


            <Text style={styles.result}>
              Actual Sampling Rate:{' '}

              {
                performanceMetrics.actualSamplingRate
                  .toFixed(1)
              }

              {' Hz'}

            </Text>


            <Text style={styles.result}>
              Completed Corrections:{' '}

              {
                performanceMetrics.completedCorrections
              }

            </Text>


            <Text style={styles.result}>
              Correction Completion Rate:{' '}

              {
                performanceMetrics.completionRate
                  .toFixed(1)
              }

              %

            </Text>


            <Text style={styles.result}>
              Feedback Events:{' '}

              {
                performanceMetrics
                  .feedbackEvents
              }

            </Text>


            <Text style={styles.result}>
              Time in Good Posture:{' '}

              {
                (
                  performanceMetrics
                    .timeInGoodPosture /
                  1000
                ).toFixed(1)
              }

              {' sec'}

            </Text>


            <Text style={styles.result}>
              Longest Continuous Good Posture:{' '}

              {
                (
                  performanceMetrics
                    .longestContinuousGoodPosture /
                  1000
                ).toFixed(1)
              }

              {' sec'}

            </Text>


            {/* =================================
                POSTURE-SPECIFIC METRICS
            ================================= */}

            <Text style={styles.heading}>
              Posture-Specific Metrics
            </Text>


            <Text style={styles.result}>
              Forward:{' '}

              {
                performanceMetrics
                  .postureSpecific
                  .forward
              }

            </Text>


            <Text style={styles.result}>
              Backward:{' '}

              {
                performanceMetrics
                  .postureSpecific
                  .backward
              }

            </Text>


            <Text style={styles.result}>
              Left:{' '}

              {
                performanceMetrics
                  .postureSpecific
                  .left
              }

            </Text>


            <Text style={styles.result}>
              Right:{' '}

              {
                performanceMetrics
                  .postureSpecific
                  .right
              }

            </Text>


            {/* =================================
                DIRECTION CORRECTION TIMES
            ================================= */}

            <Text style={styles.heading}>
              Average Correction Time by Direction
            </Text>


            <Text style={styles.result}>
              Forward:{' '}

              {
                performanceMetrics
                  .directionCorrectionTimes
                  .forward === null

                  ? 'N/A'

                  : performanceMetrics
                    .directionCorrectionTimes
                    .forward
                    .toFixed(2)
              }

              {' sec'}

            </Text>


            <Text style={styles.result}>
              Backward:{' '}

              {
                performanceMetrics
                  .directionCorrectionTimes
                  .backward === null

                  ? 'N/A'

                  : performanceMetrics
                    .directionCorrectionTimes
                    .backward
                    .toFixed(2)
              }

              {' sec'}

            </Text>


            <Text style={styles.result}>
              Left:{' '}

              {
                performanceMetrics
                  .directionCorrectionTimes
                  .left === null

                  ? 'N/A'

                  : performanceMetrics
                    .directionCorrectionTimes
                    .left
                    .toFixed(2)
              }

              {' sec'}

            </Text>


            <Text style={styles.result}>
              Right:{' '}

              {
                performanceMetrics
                  .directionCorrectionTimes
                  .right === null

                  ? 'N/A'

                  : performanceMetrics
                    .directionCorrectionTimes
                    .right
                    .toFixed(2)
              }

              {' sec'}

            </Text>


            {/* =================================
                DEVIATION HISTORY
            ================================= */}

            <Text style={styles.heading}>
              Deviation History
            </Text>


            <Text style={styles.result}>
              Recorded Points:{' '}

              {
                performanceMetrics
                  .deviationHistory
                  .length
              }

            </Text>

          </View>

        )
      }


      {/* =================================
          CALIBRATION
      ================================= */}

      <View style={styles.calibrationCard}>

        <Text style={styles.heading}>
          Personalized Calibration
        </Text>


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

                  <Text style={styles.warning}>
                    {calibrationResult.reason}
                  </Text>

                )
              }


              <Pressable
                style={styles.button}
                onPress={startCalibration}
              >

                <Text style={styles.buttonText}>
                  Calibrate Again
                </Text>

              </Pressable>

            </>

          )
        }

      </View>


      {/* =================================
          SYSTEM STATUS
      ================================= */}

      <View style={styles.statusCard}>

        <Text style={styles.status}>
          ● IMU ACTIVE
        </Text>


        <Text style={styles.frequency}>
          Target sampling: 50 Hz
        </Text>

      </View>


      <StatusBar style="auto" />

    </ScrollView>

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


// =======================================
// STYLES
// =======================================

const styles = StyleSheet.create({

  container: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#f5f5f5',
  },


  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },


  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },


  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },


  calibrationCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },


  heading: {
    fontSize: 20,
    fontWeight: '600',
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
    backgroundColor: '#222',
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
  },


  result: {
    fontSize: 16,
    marginVertical: 3,
  },


  warning: {
    fontSize: 15,
    marginTop: 10,
  },


  goodStatus: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 15,
  },


  warningStatus: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 15,
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

});