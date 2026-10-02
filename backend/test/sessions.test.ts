import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import Database from 'better-sqlite3';

type JsonObject = Record<string, unknown>;
type Direction = 'forward' | 'backward' | 'left' | 'right';

interface AnalyticsPayloadOptions {
    startTime: number;
    monitoredDuration: number;
    timeInGoodPosture: number;
    feedbackDirections: Direction[];
    responses: Array<{
        responseTime: number;
        direction: Direction;
    }>;
}

const testDirectory = mkdtempSync(
    path.join(tmpdir(), 'pjt-i-backend-test-')
);
const testDatabasePath = path.join(testDirectory, 'posture.db');

process.env.PJT_I_DATABASE_PATH = testDatabasePath;

const { app } = require('../src/server') as typeof import('../src/server');
const db = require('../src/database').default as typeof import('../src/database').default;

function createSessionPayload(
    id: string,
    sampleCount = 1
): JsonObject {
    const startTime = 1_760_000_000_000;
    const samples = Array.from(
        { length: sampleCount },
        (_, index) => ({
            timestamp: startTime + index * 20,
            pitch: 90,
            roll: 0,
            pitchDeviation: 0,
            rollDeviation: 0,
            overallDeviation: 0,
            postureAcceptable: true,
            direction: 'neutral',
            pitchThreshold: 5,
            rollThreshold: 5,
        })
    );
    const monitoredDuration = sampleCount * 20;

    return {
        id,
        startTime,
        endTime: startTime + monitoredDuration,
        monitoredDuration,
        sampleCount,
        actualSamplingRate: 50,
        calibration: {
            pitchBaseline: 90,
            rollBaseline: 0,
            pitchStd: 0.5,
            rollStd: 0.5,
            confidence: 87.5,
            sampleCount: 1500,
            duration: 30,
            valid: true,
        },
        samples,
        feedbackEvents: [],
        correctionResponses: [],
        metrics: {
            consistency: 100,
            averageCorrectionTime: null,
            feedbackEvents: 0,
            completedCorrections: 0,
            completionRate: 0,
            timeInGoodPosture: monitoredDuration,
            longestContinuousGoodPosture: monitoredDuration,
            postureSpecific: {
                forward: 0,
                backward: 0,
                left: 0,
                right: 0,
            },
            directionCorrectionTimes: {
                forward: null,
                backward: null,
                left: null,
                right: null,
            },
            actualSamplingRate: 50,
            monitoredDuration,
            sampleCount,
            deviationHistory: samples.map(sample => ({
                timestamp: sample.timestamp,
                pitchDeviation: sample.pitchDeviation,
                rollDeviation: sample.rollDeviation,
                overallDeviation: sample.overallDeviation,
                pitchThreshold: sample.pitchThreshold,
                rollThreshold: sample.rollThreshold,
            })),
        },
    };
}

function configureAnalyticsPayload(
    payload: JsonObject,
    options: AnalyticsPayloadOptions
): JsonObject {
    const metrics = payload.metrics as JsonObject;
    const sampleCount = payload.sampleCount as number;
    const postureSpecific = {
        forward: 0,
        backward: 0,
        left: 0,
        right: 0,
    };

    for (const direction of options.feedbackDirections) {
        postureSpecific[direction]++;
    }

    const correctionTimes: Record<Direction, number[]> = {
        forward: [],
        backward: [],
        left: [],
        right: [],
    };

    for (const response of options.responses) {
        correctionTimes[response.direction].push(response.responseTime);
    }

    const directionCorrectionTimes = Object.fromEntries(
        Object.entries(correctionTimes).map(([direction, times]) => [
            direction,
            times.length > 0
                ? times.reduce((sum, value) => sum + value, 0) / times.length
                : null,
        ])
    );
    const totalCorrectionTime = options.responses.reduce(
        (sum, response) => sum + response.responseTime,
        0
    );

    payload.startTime = options.startTime;
    payload.endTime = options.startTime + options.monitoredDuration;
    payload.monitoredDuration = options.monitoredDuration;
    payload.actualSamplingRate = sampleCount / (
        options.monitoredDuration / 1000
    );
    payload.feedbackEvents = options.feedbackDirections.map(
        (direction, index) => ({
            timestamp: options.startTime + index,
            deviation: 6,
            direction,
        })
    );
    payload.correctionResponses = options.responses.map(
        (response, index) => ({
            feedbackTimestamp: options.startTime + index,
            correctionTimestamp:
                options.startTime + index + response.responseTime * 1000,
            initialDeviation: 6,
            finalDeviation: 1,
            responseTime: response.responseTime,
            direction: response.direction,
        })
    );

    metrics.consistency = options.monitoredDuration > 0
        ? options.timeInGoodPosture / options.monitoredDuration * 100
        : 0;
    metrics.averageCorrectionTime = options.responses.length > 0
        ? totalCorrectionTime / options.responses.length
        : null;
    metrics.feedbackEvents = options.feedbackDirections.length;
    metrics.completedCorrections = options.responses.length;
    metrics.completionRate = options.feedbackDirections.length > 0
        ? options.responses.length / options.feedbackDirections.length * 100
        : 0;
    metrics.timeInGoodPosture = options.timeInGoodPosture;
    metrics.longestContinuousGoodPosture = options.timeInGoodPosture;
    metrics.postureSpecific = postureSpecific;
    metrics.directionCorrectionTimes = directionCorrectionTimes;
    metrics.actualSamplingRate = payload.actualSamplingRate;
    metrics.monitoredDuration = options.monitoredDuration;

    return payload;
}

async function readJson(response: Response): Promise<JsonObject> {
    const value: unknown = await response.json();

    assert.equal(typeof value, 'object');
    assert.notEqual(value, null);
    assert.equal(Array.isArray(value), false);

    return value as JsonObject;
}

test('session API persistence', async context => {
    const server = app.listen(0, '127.0.0.1');
    const validSession = configureAnalyticsPayload(
        createSessionPayload('test-session-valid'),
        {
            startTime: 1_760_000_001_000,
            monitoredDuration: 20,
            timeInGoodPosture: 20,
            feedbackDirections: ['forward', 'left', 'right'],
            responses: [
                { responseTime: 1, direction: 'forward' },
                { responseTime: 3, direction: 'left' },
            ],
        }
    );

    try {
        await new Promise<void>((resolve, reject) => {
            server.once('listening', resolve);
            server.once('error', reject);
        });

        const address = server.address() as AddressInfo;
        const baseUrl = `http://127.0.0.1:${address.port}`;

        await context.test('analytics endpoints return empty results', async () => {
            const summaryResponse = await fetch(
                `${baseUrl}/api/metrics/summary`
            );
            const summary = await readJson(summaryResponse);
            const trendsResponse = await fetch(
                `${baseUrl}/api/metrics/trends`
            );
            const trends = await readJson(trendsResponse);

            assert.equal(summaryResponse.status, 200);
            assert.deepEqual(summary, {
                totalSessions: 0,
                includedSessions: 0,
                excludedSessions: 0,
                totalMonitoredDuration: 0,
                averageConsistency: null,
                averageCorrectionTime: null,
                totalFeedbackEvents: 0,
                totalCompletedCorrections: 0,
                overallCompletionRate: 0,
                averageSamplingRate: null,
            });
            assert.equal(trendsResponse.status, 200);
            assert.deepEqual(trends, { sessions: [] });
        });

        await context.test('health endpoint returns successfully', async () => {
            const response = await fetch(`${baseUrl}/`);
            const body = await readJson(response);

            assert.equal(response.status, 200);
            assert.equal(body.message, 'PJT-I Posture Backend is running');
        });

        await context.test('valid session POST succeeds', async () => {
            const response = await fetch(`${baseUrl}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(validSession),
            });
            const body = await readJson(response);

            assert.equal(response.status, 201);
            assert.equal(body.sessionId, 'test-session-valid');
        });

        await context.test('analytics summarize one valid session', async () => {
            const response = await fetch(`${baseUrl}/api/metrics/summary`);
            const body = await readJson(response);

            assert.equal(response.status, 200);
            assert.equal(body.totalSessions, 1);
            assert.equal(body.includedSessions, 1);
            assert.equal(body.excludedSessions, 0);
            assert.equal(body.averageConsistency, 100);
            assert.equal(body.averageCorrectionTime, 2);
            assert.equal(body.totalFeedbackEvents, 3);
            assert.equal(body.totalCompletedCorrections, 2);
            assert.equal(body.averageSamplingRate, 50);
        });

        await context.test('analytics aggregate multiple valid sessions', async () => {
            const secondSession = configureAnalyticsPayload(
                createSessionPayload('test-session-second', 3),
                {
                    startTime: 1_760_000_000_000,
                    monitoredDuration: 80,
                    timeInGoodPosture: 0,
                    feedbackDirections: ['forward', 'backward'],
                    responses: [
                        { responseTime: 10, direction: 'forward' },
                    ],
                }
            );
            const postResponse = await fetch(`${baseUrl}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(secondSession),
            });

            assert.equal(postResponse.status, 201);

            const summaryResponse = await fetch(
                `${baseUrl}/api/metrics/summary`
            );
            const summary = await readJson(summaryResponse);

            assert.equal(summaryResponse.status, 200);
            assert.equal(summary.totalSessions, 2);
            assert.equal(summary.includedSessions, 2);
            assert.equal(summary.excludedSessions, 0);
            assert.equal(summary.totalMonitoredDuration, 100);
            assert.equal(summary.averageConsistency, 20);
            assert.equal(summary.averageCorrectionTime, 14 / 3);
            assert.equal(summary.totalFeedbackEvents, 5);
            assert.equal(summary.totalCompletedCorrections, 3);
            assert.equal(summary.overallCompletionRate, 60);
            assert.equal(summary.averageSamplingRate, 40);

            const trendsResponse = await fetch(
                `${baseUrl}/api/metrics/trends`
            );
            const trends = await readJson(trendsResponse);
            const sessions = trends.sessions as JsonObject[];

            assert.equal(trendsResponse.status, 200);
            assert.deepEqual(
                sessions.map(session => session.id),
                ['test-session-second', 'test-session-valid']
            );
            assert.deepEqual(
                sessions[0].directionCorrectionTimes,
                {
                    forward: 10,
                    backward: null,
                    left: null,
                    right: null,
                }
            );
            assert.deepEqual(
                sessions[1].directionCorrectionTimes,
                {
                    forward: 1,
                    backward: null,
                    left: 3,
                    right: null,
                }
            );
            assert.equal('samples' in sessions[0], false);
            assert.equal('deviationHistory' in sessions[0], false);
            assert.equal('calibration' in sessions[0], false);
            assert.equal('correctionResponses' in sessions[0], false);
        });

        await context.test('GET session collection returns stored sessions', async () => {
            const response = await fetch(`${baseUrl}/api/sessions`);
            const body: unknown = await response.json();

            assert.equal(response.status, 200);
            assert.ok(Array.isArray(body));
            assert.ok(body.some(session => (
                typeof session === 'object' &&
                session !== null &&
                'id' in session &&
                session.id === 'test-session-valid'
            )));
        });

        await context.test('GET by ID returns the requested session', async () => {
            const response = await fetch(
                `${baseUrl}/api/sessions/test-session-valid`
            );
            const body = await readJson(response);

            assert.equal(response.status, 200);
            assert.deepEqual(body, validSession);
        });

        await context.test('missing session ID returns 404', async () => {
            const response = await fetch(
                `${baseUrl}/api/sessions/missing-session`
            );

            assert.equal(response.status, 404);
        });

        await context.test('malformed session payload returns 400', async () => {
            const response = await fetch(`${baseUrl}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: 'malformed-session' }),
            });

            assert.equal(response.status, 400);
        });

        await context.test('non-finite numeric values return 400', async () => {
            const serialized = JSON.stringify(
                createSessionPayload('non-finite-session')
            ).replace('"actualSamplingRate":50', '"actualSamplingRate":1e400');
            const response = await fetch(`${baseUrl}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: serialized,
            });

            assert.equal(response.status, 400);
        });

        await context.test('duplicate session ID returns 409', async () => {
            const response = await fetch(`${baseUrl}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(validSession),
            });

            assert.equal(response.status, 409);
        });

        await context.test('realistically sized session exceeds 100 KB and succeeds', async () => {
            const largeSession = createSessionPayload(
                'test-session-large',
                2500
            );
            const serialized = JSON.stringify(largeSession);

            assert.ok(Buffer.byteLength(serialized) > 100 * 1024);

            const response = await fetch(`${baseUrl}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: serialized,
            });

            assert.equal(response.status, 201);
        });

        await context.test('incompatible legacy sessions are excluded', async () => {
            db.prepare(`
                INSERT INTO sessions (
                  id,
                  start_time,
                  end_time,
                  monitored_duration,
                  sample_count,
                  actual_sampling_rate,
                  session_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                'legacy-incompatible',
                1_750_000_000_000,
                1_750_000_001_000,
                1000,
                50,
                50,
                JSON.stringify({
                    id: 'legacy-incompatible',
                    metrics: { consistency: 80 },
                })
            );

            const summaryResponse = await fetch(
                `${baseUrl}/api/metrics/summary`
            );
            const summary = await readJson(summaryResponse);
            const trendsResponse = await fetch(
                `${baseUrl}/api/metrics/trends`
            );
            const trends = await readJson(trendsResponse);
            const sessions = trends.sessions as JsonObject[];

            assert.equal(summaryResponse.status, 200);
            assert.equal(summary.totalSessions, 4);
            assert.equal(summary.includedSessions, 3);
            assert.equal(summary.excludedSessions, 1);
            assert.equal(
                sessions.some(session => session.id === 'legacy-incompatible'),
                false
            );
        });

        await context.test('analytics endpoints return 500 on database failure', async () => {
            const originalPrepare = db.prepare;
            const originalConsoleError = console.error;

            Object.defineProperty(db, 'prepare', {
                configurable: true,
                value: () => {
                    throw new Error('Simulated database failure');
                },
            });
            console.error = () => undefined;

            try {
                const summaryResponse = await fetch(
                    `${baseUrl}/api/metrics/summary`
                );
                const trendsResponse = await fetch(
                    `${baseUrl}/api/metrics/trends`
                );

                assert.equal(summaryResponse.status, 500);
                assert.equal(trendsResponse.status, 500);
            } finally {
                Object.defineProperty(db, 'prepare', {
                    configurable: true,
                    value: originalPrepare,
                });
                console.error = originalConsoleError;
            }
        });

        await context.test('sessions persist in the isolated SQLite database', () => {
            assert.ok(statSync(testDatabasePath).isFile());

            const persistedDatabase = new Database(
                testDatabasePath,
                { readonly: true }
            );

            try {
                const row = persistedDatabase
                    .prepare('SELECT COUNT(*) AS count FROM sessions')
                    .get() as { count: number };

                assert.equal(row.count, 4);
            } finally {
                persistedDatabase.close();
            }
        });
    } finally {
        if (server.listening) {
            await new Promise<void>((resolve, reject) => {
                server.close(error => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve();
                });
            });
        }

        db.close();
        rmSync(testDirectory, { recursive: true, force: true });
        delete process.env.PJT_I_DATABASE_PATH;
    }
});
