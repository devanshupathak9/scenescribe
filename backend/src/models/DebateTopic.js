const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// A debate motion managed from the admin panel. While this table has no active
// rows, learners get the built-in list in data/debateTopics.js instead.
const DebateTopic = sequelize.define('DebateTopic', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  motion: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: { len: [8, 200] },
  },
  category: {
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: 'General',
  },
  // The lowest level the motion works well for.
  level: {
    type: DataTypes.ENUM('beginner', 'intermediate', 'advanced'),
    allowNull: false,
    defaultValue: 'intermediate',
  },
  // Talking points shown to the learner as hints for the side they pick.
  points_for: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
  },
  points_against: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
});

module.exports = DebateTopic;
