export type Orientation = {
    pitch: number;
    roll: number;
};

const RAD_TO_DEG = 180 / Math.PI;

const ALPHA = 0.98;

export class OrientationEstimator {
    private sensorPitch = 0;
    private sensorRoll = 0;

    private initialized = false;

    update(
        ax: number,
        ay: number,
        az: number,
        gx: number,
        gy: number,
        dt: number
    ): Orientation {
        /*
         * -----------------------------------------
         * 1. Accelerometer-based sensor orientation
         * -----------------------------------------
         */

        const pitchAcc =
            Math.atan2(
                -ax,
                Math.sqrt(ay * ay + az * az)
            ) * RAD_TO_DEG;

        const rollAcc =
            Math.atan2(ay, az) * RAD_TO_DEG;

        /*
         * -----------------------------------------
         * 2. Initialize using accelerometer
         * -----------------------------------------
         */

        if (!this.initialized) {
            this.sensorPitch = pitchAcc;
            this.sensorRoll = rollAcc;

            this.initialized = true;

            return this.mapToBodyFrame();
        }

        /*
         * -----------------------------------------
         * 3. Gyroscope integration
         *
         * Expo gyroscope values are rad/s.
         * -----------------------------------------
         */

        const sensorPitchGyro =
            this.sensorPitch +
            gy * dt * RAD_TO_DEG;

        const sensorRollGyro =
            this.sensorRoll +
            gx * dt * RAD_TO_DEG;

        /*
         * -----------------------------------------
         * 4. Complementary filter
         * -----------------------------------------
         */

        this.sensorPitch =
            ALPHA * sensorPitchGyro +
            (1 - ALPHA) * pitchAcc;

        this.sensorRoll =
            ALPHA * sensorRollGyro +
            (1 - ALPHA) * rollAcc;

        /*
         * -----------------------------------------
         * 5. Convert phone coordinates to
         *    our BODY coordinate system.
         *
         * Phone is currently mounted in portrait.
         *
         * Body Pitch:
         *   forward = positive
         *
         * Body Roll:
         *   right = positive
         * -----------------------------------------
         */

        return this.mapToBodyFrame();
    }

    private mapToBodyFrame(): Orientation {
        const bodyPitch =
            90 - this.sensorRoll;

        const bodyRoll =
            this.sensorPitch;

        return {
            pitch: bodyPitch,
            roll: bodyRoll,
        };
    }

    reset() {
        this.sensorPitch = 0;
        this.sensorRoll = 0;
        this.initialized = false;
    }
}