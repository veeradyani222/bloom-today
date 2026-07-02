import assert from 'node:assert/strict';
import { test } from 'node:test';
import EventEmitter from 'eventemitter3';
import { registerLiveClientListeners } from './client-listeners.js';

test('registerLiveClientListeners attaches handlers before returning and detaches them later', () => {
  const client = new EventEmitter();
  const events = [];

  const detach = registerLiveClientListeners(client, {
    open: () => events.push('open'),
    setupcomplete: () => events.push('setupcomplete'),
  });

  client.emit('open');
  client.emit('setupcomplete');

  detach();
  client.emit('open');

  assert.deepEqual(events, ['open', 'setupcomplete']);
});
