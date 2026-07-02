import assert from 'node:assert/strict';
import test from 'node:test';

import { GenAILiveClient } from './genai-live-client.js';

test('sendRealtimeInput marks the live client disconnected when the websocket is already closed', () => {
  const emitted = [];
  const client = Object.create(GenAILiveClient.prototype);
  client.status = 'connected';
  client.session = {
    sendRealtimeInput() {
      throw new Error('WebSocket is already in CLOSING or CLOSED state.');
    },
  };
  client.emit = (eventName, payload) => {
    emitted.push({ eventName, payload });
  };

  client.sendRealtimeInput([{ mimeType: 'audio/pcm;rate=16000', data: 'abc' }]);

  assert.equal(client.status, 'disconnected');
  assert.equal(client.session, null);
  assert.equal(emitted[0].eventName, 'close');
  assert.match(emitted[0].payload.reason, /websocket closed/i);
});

test('send normalizes a text object into a user content turn', () => {
  const sent = [];
  const client = Object.create(GenAILiveClient.prototype);
  client.status = 'connected';
  client.session = {
    sendClientContent(payload) {
      sent.push(payload);
    },
  };
  client.emit = () => {};

  client.send({ text: 'Greet Veera now - warm and brief.' });

  assert.deepEqual(sent, [
    {
      turns: [
        {
          role: 'user',
          parts: [{ text: 'Greet Veera now - warm and brief.' }],
        },
      ],
      turnComplete: true,
    },
  ]);
});
