import {
    Accelerometer,
    Gyroscope,
} from 'expo-sensors';

export type IMUData = {
    timestamp: number;

    accelerometer: {
        x: number;
        y: number;
        z: number;
    };

    gyroscope: {
        x: number;
        y: number;
        z: number;
    };
};

export type IMUCallback = (data: IMUData) => void;

export class IMUService {
    private accelerometerSubscription: ReturnType<
        typeof Accelerometer.addListener
    > | null = null;

    private gyroscopeSubscription: ReturnType<
        typeof Gyroscope.addListener
    > | null = null;

    private latestAccelerometer = {
        x: 0,
        y: 0,
        z: 0,
    };

    private latestGyroscope = {
        x: 0,
        y: 0,
        z: 0,
    };

    private callback: IMUCallback | null = null;

    start(callback: IMUCallback) {
        this.callback = callback;

        // 20 ms = approximately 50 Hz
        Accelerometer.setUpdateInterval(20);
        Gyroscope.setUpdateInterval(20);

        this.accelerometerSubscription =
            Accelerometer.addListener((data) => {
                this.latestAccelerometer = data;
                this.emit();
            });

        this.gyroscopeSubscription =
            Gyroscope.addListener((data) => {
                this.latestGyroscope = data;
            });
    }

    private emit() {
        if (!this.callback) {
            return;
        }

        this.callback({
            timestamp: Date.now(),

            accelerometer: {
                ...this.latestAccelerometer,
            },

            gyroscope: {
                ...this.latestGyroscope,
            },
        });
    }

    stop() {
        this.accelerometerSubscription?.remove();
        this.gyroscopeSubscription?.remove();

        this.accelerometerSubscription = null;
        this.gyroscopeSubscription = null;
        this.callback = null;
    }
}