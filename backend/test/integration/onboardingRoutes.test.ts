// Import Node's native crypto module to generate unique test data
import { randomUUID } from 'node:crypto';
// Import Vitest testing utilities and lifecycle hooks
import { afterAll, describe, expect, it } from 'vitest';
// Import Supertest for making end-to-end HTTP requests against the Express app
import request from 'supertest';
// Import the actual application factory and the real database connection pool
import { createApp } from '../../src/app.js';
import { pool } from '../../src/config/db/db_init.js';

// Bootstrap the full Express application with all real middleware, routes, and error handlers
const app = createApp();

// Define standard credentials for the test run
const password = 'Password123!';
// Learners sign in with a username, not an email (identity slice). UUIDs keep the
// usernames unique so repeated runs never collide.
const usernameA = `la-${randomUUID().slice(0, 8)}`;
const usernameB = `lb-${randomUUID().slice(0, 8)}`;

// Variables to hold the JWTs for our two distinct test users
let tokenA = '';
let tokenB = '';

/**
 * Registers a learner and returns their session token.
 *
 * @param username - The unique username for the test learner
 * @returns The signed session token returned by signup
 */
async function signUp(username: string) {
    // Create a real learner session through the production signup endpoint.
    const response = await request(app)
        .post('/api/auth/signup')
        .send({ firstName: 'Test', lastName: 'Learner', username, password, role: 'learner' });

    // Ensure the signup was actually successful before proceeding
    expect(response.status).toBe(201);
    // Return the credential used to authenticate later integration requests.
    return response.body.token as string;
}

// Global cleanup hook: Runs once after all tests in this suite have finished
afterAll(async () => {
    // Purge the test users from the database. 
    // Because of the 'ON DELETE CASCADE' constraint on learner_settings, this also cleans up their preferences.
    await pool.query('DELETE FROM users WHERE username IN ($1, $2)', [usernameA, usernameB]);
});

// Full end-to-end integration test suite for the authenticated onboarding flow
describe('authenticated learner onboarding', () => {
    
    it('creates separate sessions for separate learners', async () => {
        // Act: Register both users
        // Create independent identities so ownership checks have distinct principals.
        tokenA = await signUp(usernameA);
        tokenB = await signUp(usernameB);
        
        // Assert: Ensure the authentication system issues unique tokens per user
        expect(tokenA).not.toBe(tokenB);
    });

    it('rejects invalid setup values before persistence', async () => {
        // Act: Attempt to save settings with logically invalid data (born in 1800, negative goal)
        const response = await request(app)
            .put('/api/onboarding/saveSettings')
            .set('Authorization', `Bearer ${tokenA}`) // Authenticate as User A
            .send({ targetLanguage: 'zulu', dateOfBirth: '1800-01-01', interfaceLanguage: 'english', dailyGoal: -1 });

        // Assert: The validation layer should catch this and return a 400 Bad Request
        expect(response.status).toBe(400);
        // Validate that each independently invalid field is reported.
        expect(response.body.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ field: 'dateOfBirth' }),
            expect.objectContaining({ field: 'dailyGoal' }),
        ]));
    });

    it('saves and reads settings for the authenticated learner only', async () => {
        // 1. User A successfully saves their valid settings
        const saveResponse = await request(app)
            .put('/api/onboarding/saveSettings')
            .set('Authorization', `Bearer ${tokenA}`)
            .send({ targetLanguage: 'zulu', dateOfBirth: '2005-01-01', interfaceLanguage: 'english', dailyGoal: 15 });

        // Verify the database confirmed the save and echoed the correct data back
        expect(saveResponse.status).toBe(200);
        // Confirm the save response includes the generated owner key.
        expect(saveResponse.body.user_id).toBeGreaterThan(0);
        // Confirm the saved target language round-trips through PostgreSQL.
        expect(saveResponse.body.target_language).toBe('zulu');

        // 2. User A retrieves their own settings
        const ownSettings = await request(app)
            .get('/api/onboarding/getSettings')
            .set('Authorization', `Bearer ${tokenA}`);
            
        // Verify User A can successfully read the data they just saved
        expect(ownSettings.status).toBe(200);
        // The owning learner can retrieve their just-persisted language preference.
        expect(ownSettings.body.target_language).toBe('zulu');

        // 3. User B attempts to retrieve settings
        const otherSettings = await request(app)
            .get('/api/onboarding/getSettings')
            .set('Authorization', `Bearer ${tokenB}`);
            
        // Verify User B receives a 404 Not Found because they haven't saved their own settings yet.
        // Importantly, this proves User B cannot access User A's settings, ensuring tenant isolation.
        // A missing own row must not leak the other learner's saved preferences.
        expect(otherSettings.status).toBe(404);
    });

    it('evaluates under-13 access restrictions based on database records', async () => {
        // Compute a birth date representing a 10-year-old child to test age detection
        // Derive the test date from today's date so the integration case remains current.
        const childBirthDate = new Date();
        childBirthDate.setFullYear(childBirthDate.getFullYear() - 10);
        const dobString = childBirthDate.toISOString().slice(0, 10);

        // Act: User B saves preferences with an under-13 birth date into PostgreSQL
        const saveResponse = await request(app)
            .put('/api/onboarding/saveSettings')
            .set('Authorization', `Bearer ${tokenB}`)
            .send({ targetLanguage: 'zulu', dateOfBirth: dobString, interfaceLanguage: 'english', dailyGoal: 15 });

        // Assert: Database confirmed save and computed child safety policy refusing entry
        expect(saveResponse.status).toBe(200);
        // Confirm the save response includes the policy computed from persisted DOB and links.
        expect(saveResponse.body.access).toMatchObject({
            isUnder13: true,
            hasActiveParentLink: false,
            canAccessContent: false,
            contentAudience: 'child',
        });

        // Act: Query the dedicated /api/onboarding/getAccess endpoint
        const accessResponse = await request(app)
            .get('/api/onboarding/getAccess')
            .set('Authorization', `Bearer ${tokenB}`);

        // Assert: Access endpoint directly queries the saved DOB and parent links to refuse access
        expect(accessResponse.status).toBe(200);
        // Ensure the dedicated access endpoint reports the same persisted policy.
        expect(accessResponse.body).toMatchObject({
            isUnder13: true,
            hasActiveParentLink: false,
            canAccessContent: false,
            contentAudience: 'child',
        });
    });

    it('revokes the session on logout', async () => {
        // Act: User A explicitly logs out
        const logoutResponse = await request(app)
            .post('/api/auth/logout')
            .set('Authorization', `Bearer ${tokenA}`);
            
        // Verify the logout endpoint responded with a successful 'No Content' status
        expect(logoutResponse.status).toBe(204);

        // Act & Assert: User A attempts to access a protected route with the now-revoked token
        const response = await request(app)
            .get('/api/onboarding/getSettings')
            .set('Authorization', `Bearer ${tokenA}`);
            
        // Verify the auth middleware rejects the revoked token with a 401 Unauthorized
        expect(response.status).toBe(401);
    });
});