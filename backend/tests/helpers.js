const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../src/app');
const { sequelize, User, Scene } = require('../src/models');
const { issueSessionToken } = require('../src/services/tokens');
const { todayStr } = require('../src/utils/date');

const app = createApp();
const api = () => request(app);

async function resetDb() {
  await sequelize.sync({ force: true });
}

let n = 0;
async function makeUser(overrides = {}) {
  n += 1;
  const password = overrides.password || 'password123';
  const user = await User.create({
    email: `user${n}@test.com`,
    username: `user${n}`,
    is_registered: true,
    ...overrides,
    password_hash: await bcrypt.hash(password, 10),
  }, { hooks: false });
  return { user, token: issueSessionToken(user), password };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function makeScene(overrides = {}) {
  return Scene.create({
    title: 'Coffee order',
    description: 'A man orders a latte at a busy cafe counter and pays by card.',
    youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    publish_date: todayStr(),
    difficulty: 'beginner',
    ...overrides,
  });
}

module.exports = { app, api, resetDb, makeUser, makeScene, auth, sequelize };
