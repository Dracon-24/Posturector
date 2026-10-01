// =====================================
// HAPTIC FEEDBACK SERVICE
// =====================================

import * as Haptics from 'expo-haptics';
import { Vibration } from 'react-native';


export class HapticService {


    // ===================================
    // SINGLE FEEDBACK
    // ===================================

    async vibrate(
        duration: number
    ): Promise<void> {

        /*
         * One-shot haptic feedback.
         *
         * Kept for compatibility with the
         * existing feedback architecture.
         */

        await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Warning
        );

    }


    // ===================================
    // CONTINUOUS VIBRATION
    // ===================================

    startContinuous(): void {

        /*
         * TESTING MODE
         *
         * Repeated vibration continues
         * until stop() is called.
         */

        Vibration.vibrate(
            [0, 200, 100],
            true
        );

    }


    // ===================================
    // STOP VIBRATION
    // ===================================

    stop(): void {

        Vibration.cancel();

    }

}