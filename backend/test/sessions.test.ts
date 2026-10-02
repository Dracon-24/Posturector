import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import Database from 'better-sqlite3';

type JsonObject = Record<string, unknown>;

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

async function readJson(response: Response): Promise<JsonObject> {
    const value: unknown = await response.json();

    assert.equal(typeof value, 'object');
    assert.notEqual(value, null);
    assert.equal(Array.isArray(value), false);

    return value as JsonObject;
}

test('session API persistence', async context => {
    const server = app.listen(0, '127.0.0.1');
    const validSession = createSessionPayload('test-session-valid');

    try {
        await new Promise<void>((resolve, reject) => {
            server.once('listening', resolve);
            server.once('error', reject);
        });

        const address = server.address() as AddressInfo;
        const baseUrl = `http://127.0.0.1:${address.port}`;

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

                assert.equal(row.count, 2);
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
