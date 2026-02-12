const now = () => new Date();
const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

function buildUser(uid, overrides = {}) {
  const base = {
    displayName: `User ${uid}`,
    username: `user_${uid}`,
    profileIMG: `https://example.com/${uid}.png`,
    email: `${uid}@example.com`,
    creationDate: now(),
    lastActive: now(),
    friends: [],
  };

  return { ...base, ...overrides };
}

function buildUsername(uid) {
  return { uid };
}

function buildRequest(from, to, overrides = {}) {
  return {
    from,
    to,
    ...overrides,
  };
}

function buildDmThread(members, overrides = {}) {
  const base = {
    members,
    groupName: 'DM Thread',
    createdAt: now(),
    latestMessage: now(),
    dm: true,
  };

  return { ...base, ...overrides };
}

function buildDmMessage(senderUid, overrides = {}) {
  const base = {
    message: 'hello',
    timeSent: now(),
    sentBy: {
      user: senderUid,
    },
  };

  return { ...base, ...overrides };
}

module.exports = {
  now,
  tomorrow,
  buildUser,
  buildUsername,
  buildRequest,
  buildDmThread,
  buildDmMessage,
};
