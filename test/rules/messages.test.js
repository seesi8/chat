const { assertFails, assertSucceeds } = require('@firebase/testing');
const { setup, teardown } = require('./helpers');
const { buildDmThread, buildDmMessage, tomorrow } = require('./fixtures');

describe('messages rules (direct messaging)', () => {
  afterEach(async () => {
    await teardown();
  });

  test('denies reading messages when signed out', async () => {
    const db = await setup();
    await assertFails(db.collection('/threads/dm1/messages').get());
  });

  test('denies reading messages when user is not a thread member', async () => {
    const seed = {
      '/threads/dm1': buildDmThread(['alice', 'bob']),
      '/threads/dm1/messages/m1': buildDmMessage('alice'),
    };
    const db = await setup({ uid: 'mallory' }, seed);

    await assertFails(db.doc('/threads/dm1/messages/m1').get());
  });

  test('allows reading messages when user is a thread member', async () => {
    const seed = {
      '/threads/dm1': buildDmThread(['alice', 'bob']),
      '/threads/dm1/messages/m1': buildDmMessage('alice'),
    };
    const db = await setup({ uid: 'alice' }, seed);

    await assertSucceeds(db.doc('/threads/dm1/messages/m1').get());
  });

  test('denies creating message when signed out', async () => {
    const db = await setup();
    await assertFails(db.doc('/threads/dm1/messages/m1').set(buildDmMessage('alice')));
  });

  test('denies creating message with missing fields', async () => {
    const db = await setup({ uid: 'alice' });
    await assertFails(
      db.doc('/threads/dm1/messages/m1').set({
        message: 'hello',
        timeSent: new Date(),
      })
    );
  });

  test('denies creating message when sender does not match auth user', async () => {
    const db = await setup({ uid: 'alice' });
    await assertFails(db.doc('/threads/dm1/messages/m1').set(buildDmMessage('bob')));
  });

  test('denies creating message with non-current day timestamp', async () => {
    const db = await setup({ uid: 'alice' });
    await assertFails(
      db.doc('/threads/dm1/messages/m1').set(
        buildDmMessage('alice', {
          timeSent: tomorrow(),
        })
      )
    );
  });

  test('allows creating message with valid payload', async () => {
    const db = await setup({ uid: 'alice' });
    await assertSucceeds(db.doc('/threads/dm1/messages/m1').set(buildDmMessage('alice')));
  });
});
