// Loaded by jest before any test module. Values here win over .env because
// dotenv never overrides variables that are already set.
process.env.NODE_ENV = 'test';
process.env.TZ = 'UTC';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres:password@localhost:5432/scenescribe_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.OPENAI_API_KEY = '';
process.env.SEED_DEMO_ACCOUNTS = 'false';
process.env.APP_TIMEZONE = 'UTC';
process.env.CORS_ORIGIN = '';
// Silence the OTP console banner; tests read OTPs from the DB.
process.env.SMTP_HOST = '';
