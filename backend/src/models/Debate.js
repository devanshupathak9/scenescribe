const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// One "Debate with AI" session. Turns and the final report are JSONB because
// they are always read and written as a whole.
const Debate = sequelize.define('Debate', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  topic: {
    type: DataTypes.STRING(300),
    allowNull: false,
  },
  // The user's side; the AI argues the other one.
  user_side: {
    type: DataTypes.ENUM('for', 'against'),
    allowNull: false,
  },
  rounds: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3,
  },
  level: {
    type: DataTypes.ENUM('beginner', 'intermediate', 'advanced'),
    allowNull: false,
    defaultValue: 'intermediate',
  },
  turn_seconds: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 40,
  },
  // [{ speaker: 'user'|'ai', round, text, duration_s?, metrics?, input_type? }]
  turns: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
  },
  status: {
    type: DataTypes.ENUM('in_progress', 'completed', 'abandoned'),
    allowNull: false,
    defaultValue: 'in_progress',
  },
  // 0-100, mirrored out of `report` for cheap listing/aggregates
  overall_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  report: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  indexes: [{ fields: ['user_id', 'createdAt'] }],
});

module.exports = Debate;
