import { api } from '../api.js'

// Every method that signs the user in resolves to { user, token }, so the UI
// handles email/password, OTP, reset and Google identically via onLogin().

export const authService = {
  login: (email, password) =>
    api.post('/auth/login', { email: email.trim(), password }).then(r => r.data),

  // Step 1 of registration (also used to resend the code)
  requestSignupCode: (email) =>
    api.post('/auth/register', { email: email.trim() }),

  // Step 2: completes the account and signs in
  verifySignup: ({ email, otp, username, password, fullName }) =>
    api.post('/auth/verify', {
      email: email.trim(), otp, user_name: username.trim(), password, full_name: fullName?.trim() || undefined,
    }).then(r => r.data),

  requestPasswordReset: (email) =>
    api.post('/auth/forgot', { email: email.trim() }),

  resetPassword: ({ email, otp, password }) =>
    api.post('/auth/reset', { email: email.trim(), otp, password }).then(r => r.data),

  // credential = Google ID token from Google Identity Services (see auth/google.js).
  // The backend verifies it in backend/src/services/googleAuth.js.
  loginWithGoogle: (credential) =>
    api.post('/auth/google', { credential }).then(r => r.data),

  me: () => api.get('/auth/me').then(r => r.data.user),
}
