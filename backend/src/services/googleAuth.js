const { OAuth2Client } = require('google-auth-library');
const { env } = require('../config/env');
const { AppError } = require('../utils/http');

/**
 * Google Sign-In: verifies the ID token that Google Identity Services gives the
 * browser (web/src/auth/google.js → POST /api/auth/google { credential }).
 *
 * verifyIdToken checks the signature against Google's public keys, the issuer,
 * expiry, and that the token was minted for OUR client ID (audience). Never
 * trust a decoded-but-unverified token: that lets anyone sign in as anyone.
 *
 * @param  {string} credential  Google ID token (JWT)
 * @return {Promise<{ sub, email, email_verified, name?, picture? }>}
 * @throws AppError(501, 'GOOGLE_AUTH_NOT_CONFIGURED') when GOOGLE_CLIENT_ID is unset
 * @throws AppError(401, 'GOOGLE_TOKEN_INVALID') for a bad or expired token
 */
let client = null;

async function verifyGoogleIdToken(credential) {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new AppError(501, 'GOOGLE_AUTH_NOT_CONFIGURED',
      'Google sign-in is not available yet. Please use email and password.');
  }
  client = client || new OAuth2Client(env.GOOGLE_CLIENT_ID);

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw new AppError(401, 'GOOGLE_TOKEN_INVALID', 'Google sign-in failed or expired. Please try again.');
  }
  if (!payload?.sub || !payload.email) {
    throw new AppError(401, 'GOOGLE_TOKEN_INVALID', 'Google sign-in failed. Please try again.');
  }
  return {
    sub: payload.sub,
    email: payload.email,
    email_verified: payload.email_verified === true,
    name: payload.name,
    picture: payload.picture,
  };
}

module.exports = { verifyGoogleIdToken };
