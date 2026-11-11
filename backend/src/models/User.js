const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: true,   // null until email is verified and registration is completed
    unique: true,
    validate: { len: [3, 30] },
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: { isEmail: true },
  },
  password_hash: {
    type: DataTypes.STRING,
    allowNull: true,   // null until registration is completed, and for Google-only accounts
  },
  full_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  // Google account subject ("sub" claim). Set by POST /auth/google.
  google_id: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  avatar_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  is_registered: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,  // false = email submitted, OTP sent; true = fully registered
  },
  otp: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  otp_expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // What the current OTP is for: 'register' (new account) or 'reset' (password reset)
  otp_purpose: {
    type: DataTypes.STRING(16),
    allowNull: true,
  },
  // Wrong guesses against the current OTP; the code is burned after MAX_OTP_ATTEMPTS
  otp_attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  curr_streak: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  longest_streak: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  total_completed: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  last_submission_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  is_admin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  hooks: {
    beforeCreate: async (user) => {
      // Only hash when a plain-text password was actually provided.
      // Step 1 of registration (email-only) creates the row without a password.
      if (user.password_hash) {
        user.password_hash = await bcrypt.hash(user.password_hash, 10);
      }
    },
  },
});

User.prototype.validatePassword = async function(password) {
  // Google-only and pending accounts have no password — never a match.
  if (!this.password_hash || typeof password !== 'string') return false;
  return bcrypt.compare(password, this.password_hash);
};

// The public shape returned by every auth endpoint. Keep in sync with web/src/api.js consumers.
User.prototype.toPublic = function() {
  return {
    id: this.id,
    user_name: this.username,
    full_name: this.full_name || null,
    email: this.email,
    avatar_url: this.avatar_url || null,
    is_admin: this.is_admin,
  };
};

module.exports = User;
