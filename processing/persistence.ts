// processing/persistence.ts

export interface PersistenceConfig {
    persistenceDuration: number;
}

export interface PersistenceState {
    isOutside: boolean;
    isSustained: boolean;
    elapsedOutside: number;
}

export class PersistenceDetector {

    private outsideStartTime: number | null = null;

    private isSustained = false;


    constructor(
        private config: PersistenceConfig
    ) { }


    update(
        isOutside: boolean,
        timestamp: number
    ): PersistenceState {

        // -----------------------------------
        // Posture is acceptable
        // -----------------------------------

        if (!isOutside) {

            this.outsideStartTime = null;

            this.isSustained = false;

            return {
                isOutside: false,
                isSustained: false,
                elapsedOutside: 0,
            };
        }


        // -----------------------------------
        // First deviation sample
        // -----------------------------------

        if (
            this.outsideStartTime === null
        ) {

            this.outsideStartTime =
                timestamp;
        }


        // -----------------------------------
        // Calculate elapsed deviation time
        // -----------------------------------

        const elapsed =
            (
                timestamp -
                this.outsideStartTime
            ) / 1000;


        // -----------------------------------
        // Check persistence
        // -----------------------------------

        if (
            elapsed >=
            this.config.persistenceDuration
        ) {

            this.isSustained = true;
        }


        return {
            isOutside: true,

            isSustained:
                this.isSustained,

            elapsedOutside:
                elapsed,
        };
    }


    reset(): void {

        this.outsideStartTime =
            null;

        this.isSustained =
            false;
    }
}