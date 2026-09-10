import test from 'node:test';
import assert from 'node:assert/strict';
import { startIndexingUpload, getIndexingUpload, subscribeIndexingUploads } from './indexingUploads.js';

test('upload survives view unsubscribe and remount; duplicate start shares the job', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const unsubscribe = subscribeIndexingUploads(() => {});
  const first = startIndexingUpload('navigation', async report => {
    calls++;
    report('Uploading 50%');
    await gate;
    return { id: 'saved-run' };
  });
  unsubscribe();
  await Promise.resolve();
  assert.equal(getIndexingUpload('navigation').message, 'Uploading 50%');
  assert.equal(startIndexingUpload('navigation', () => { throw new Error('duplicate'); }), first);
  let notifications = 0;
  const remount = subscribeIndexingUploads(() => { notifications++; });
  release();
  assert.deepEqual(await first, { id: 'saved-run' });
  assert.equal(calls, 1);
  assert.equal(getIndexingUpload('navigation').active, false);
  assert.equal(notifications, 1);
  remount();
});

test('failure remains available after navigating back and can be retried', async () => {
  await startIndexingUpload('failure', async () => { throw new Error('PDF unavailable'); });
  assert.match(getIndexingUpload('failure').error.message, /PDF unavailable/);
  assert.equal(getIndexingUpload('failure').active, false);
  await startIndexingUpload('failure', async () => ({ id: 'retry' }));
  assert.equal(getIndexingUpload('failure').error, null);
  assert.equal(getIndexingUpload('failure').result.id, 'retry');
});
