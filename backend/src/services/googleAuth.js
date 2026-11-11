const { AppError } = require('../utils/http');

/**
 * ── Google Sign-In integration point ─────────────────────────────────────────
 *
 * The web app (web/src/auth/google.js) uses Google Identity Services and POSTs
 * the returned ID token to `POST /api/auth/google` as `{ credential }`.
 * routes/auth.js calls this function, then finds-or-creates the user and issues
 * the normal session JWT — so this is the only piece left to implement.
 *
 * Implement it by verifying the ID token's signature, audience and expiry, e.g.:
 *
 *   npm install google-auth-library
 *
 *   const { OAuth2Client } = require('google-auth-library');
 *   const client = new OAuth2Client();
 *   const ticket = await client.verifyIdToken({
 *     idToken: credential,
 *     audience: process.env.GOOGLE_CLIENT_ID,   // same value as web VITE_GOOGLE_CLIENT_ID
 *   });
 *   const p = ticket.getPayload();
 *   return { sub: p.sub, email: p.email, email_verified: p.email_verified,
 *            name: p.name, picture: p.picture };
 *
 * Contract:
 *   @param  {string} credential  Google ID token (JWT) from the browser
 *   @return {Promise<{ sub: string, email: string, email_verified: boolean,
 *                      name?: string, picture?: string }>}
 *   @throws AppError(401, 'GOOGLE_TOKEN_INVALID') for a bad/expired token
 *
 * Never trust the token's contents without verifying it — decoding alone lets
 * anyone sign in as anyone.
 */
// eslint-disable-next-line no-unused-vars
async function verifyGoogleIdToken(credential) {
  throw new AppError(
    501,
    'GOOGLE_AUTH_NOT_CONFIGURED',
    'Google sign-in is not available yet. Please use email and password.',
  );
}

module.exports = { verifyGoogleIdToken };
