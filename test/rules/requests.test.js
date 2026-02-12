const { assertFails, assertSucceeds } = require('@firebase/testing');
const { setup, teardown } = require('./helpers');
const { buildRequest } = require('./fixtures');

describe('requests rules', () => {
  afterEach(async () => {
    await teardown();
  });

  test('denies reading requests when signed out', async () => {
    const db = await setup();
    await assertFails(db.collection('/requests').get());
  });

  test('allows reading requests when signed in', async () => {
    const db = await setup({ uid: 'alice' });
    await assertSucceeds(db.collection('/requests').get());
  });

  test('allows creating request with required fields', async () => {
    const db = await setup({ uid: 'alice' });
    await assertSucceeds(
      db.doc('/requests/fromalicetobob').set(buildRequest('alice', 'bob'))
    );
  });

  test('denies creating request without required fields', async () => {
    const db = await setup({ uid: 'alice' });
    await assertFails(db.doc('/requests/fromalicetobob').set({}));
  });

  test('allows updating request when required fields are still present', async () => {
    const seed = {
      '/requests/fromalicetobob': buildRequest('alice', 'bob'),
    };
    const db = await setup({ uid: 'alice' }, seed);

    await assertSucceeds(
      db.doc('/requests/fromalicetobob').update({
        from: 'alice',
        to: 'bob',
        members: ['alice', 'bob'],
      })
    );
  });
});
