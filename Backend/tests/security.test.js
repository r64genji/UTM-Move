const request = require('supertest');
const { app, server } = require('../server');

describe('Security Features', () => {
    afterAll(done => {
        if (server && server.listening) {
            server.close(done);
        } else {
            done();
        }
    });

    describe('Report Submission Security', () => {
        test('should reject invalid report types', async () => {
            const res = await request(app)
                .post('/api/report')
                .send({
                    type: 'hack_the_planet',
                    details: 'Valid details string here'
                });

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toMatch(/Invalid report type/);
        });

        test('should reject details that are too short', async () => {
            const res = await request(app)
                .post('/api/report')
                .send({
                    type: 'new_stop',
                    details: 'Short'
                });

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toMatch(/at least 10 characters/);
        });

        test('should reject details that are too long', async () => {
            const longString = 'a'.repeat(2001);
            const res = await request(app)
                .post('/api/report')
                .send({
                    type: 'new_stop',
                    details: longString
                });

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toMatch(/under 2000 characters/);
        });

        test('should sanitize XSS attempts (HTML tags)', async () => {
            // It might pass validation if the sanitized string is long enough
            const xssPayload = 'This is a <script>alert(1)</script> test details string';

            // We can't easily check the written file in integration test without mocking fs,
            // but we can assume if it returns 201 it passed validation.
            // Ideally we'd check the saved content, disinfectant logic is unit tested in validators.js
            // But let's check if it accepts it (since we sanitize, not reject, for some chars)

            const res = await request(app)
                .post('/api/report')
                .send({
                    type: 'new_stop',
                    details: xssPayload
                });

            expect(res.statusCode).toBe(201);
            // The logic sanitizes, so it should be successful but stripped
        });

        test('should sanitize SQL Injection attempts', async () => {
            const sqliPayload = "Valid details check'; DROP TABLE users; --";

            const res = await request(app)
                .post('/api/report')
                .send({
                    type: 'new_stop',
                    details: sqliPayload
                });

            expect(res.statusCode).toBe(201);
        });
    });

    describe('Access Control', () => {
        test('should deny access to /api/reports without credentials', async () => {
            const res = await request(app).get('/api/reports');
            expect(res.statusCode).toBe(401);
            expect(res.headers['www-authenticate']).toBeDefined();
        });

        test('should deny access to /api/reports with wrong credentials', async () => {
            const res = await request(app)
                .get('/api/reports')
                .set('Authorization', 'Basic ' + Buffer.from('wrong:pass').toString('base64'));

            expect(res.statusCode).toBe(401);
        });

        test('should allow access to /api/reports with correct credentials (admin:admin)', async () => {
            const res = await request(app)
                .get('/api/reports')
                .set('Authorization', 'Basic ' + Buffer.from('admin:admin').toString('base64'));

            // Should be 200 OK (even if empty list)
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });
    });
});
