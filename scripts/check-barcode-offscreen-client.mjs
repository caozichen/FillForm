import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

const OFFSCREEN_DOCUMENT = 'barcode-offscreen.html';
const OFFSCREEN_TARGET = 'formpilotv2:barcode-offscreen';
const PING = 'formpilotv2:barcode-offscreen-ping';
const DECODE = 'formpilotv2:barcode-offscreen-decode';

let importSequence = 0;

async function importFreshClient(label) {
  const moduleUrl = new URL('../legacy/barcodeOffscreenClient.js', import.meta.url);
  moduleUrl.searchParams.set('test', `${label}-${Date.now()}-${importSequence += 1}`);
  return import(moduleUrl.href);
}

function barcodeDocumentContext() {
  return [{ documentUrl: `chrome-extension://test/${OFFSCREEN_DOCUMENT}` }];
}

async function withMockBrowser({ chromeApi, onEncode = () => {} }, callback) {
  const globalNames = ['chrome', 'ImageData', 'OffscreenCanvas', 'btoa'];
  const originalDescriptors = new Map(
    globalNames.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
  );

  class MockImageData {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  }

  class MockOffscreenCanvas {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }

    getContext(type) {
      assert.equal(type, '2d');
      return {
        putImageData(image, x, y) {
          assert.ok(image instanceof MockImageData);
          assert.equal(x, 0);
          assert.equal(y, 0);
        }
      };
    }

    async convertToBlob(options) {
      assert.deepEqual(options, { type: 'image/png' });
      onEncode();
      return {
        type: 'image/png',
        async arrayBuffer() {
          return new Uint8Array([137, 80, 78, 71]).buffer;
        }
      };
    }
  }

  Object.defineProperties(globalThis, {
    chrome: { configurable: true, writable: true, value: chromeApi },
    ImageData: { configurable: true, writable: true, value: MockImageData },
    OffscreenCanvas: { configurable: true, writable: true, value: MockOffscreenCanvas },
    btoa: {
      configurable: true,
      writable: true,
      value: (binary) => Buffer.from(binary, 'binary').toString('base64')
    }
  });

  try {
    const image = new MockImageData(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1);
    await callback(image);
  } finally {
    for (const [name, descriptor] of originalDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

function createRuntimeBase(getContexts, sendMessage) {
  return {
    getURL(pathname) {
      return `chrome-extension://test/${pathname}`;
    },
    getContexts,
    sendMessage
  };
}

async function testEncodingPrecedesOffscreenCreation() {
  const events = [];
  const chromeApi = {
    runtime: createRuntimeBase(
      async () => {
        events.push('getContexts');
        return [];
      },
      async (message) => {
        if (message.type === PING) {
          events.push('ping');
          return { ok: true, target: OFFSCREEN_TARGET };
        }
        assert.equal(message.type, DECODE);
        events.push('decode');
        return { ok: true, requestId: message.requestId, results: [{ text: 'encoded' }] };
      }
    ),
    offscreen: {
      async createDocument() {
        events.push('createDocument');
      },
      async closeDocument() {
        events.push('closeDocument');
      }
    }
  };

  await withMockBrowser({ chromeApi, onEncode: () => events.push('encode') }, async (image) => {
    const { decodeBarcodeInOffscreen } = await importFreshClient('encode-first');
    const results = await decodeBarcodeInOffscreen(image);
    assert.deepEqual(results, [{ text: 'encoded' }]);
  });

  assert.deepEqual(events, ['encode', 'getContexts', 'createDocument', 'ping', 'decode']);
}

async function testReceivingEndDisconnectRetriesOnce() {
  let decodeCalls = 0;
  let closeCalls = 0;
  let createCalls = 0;
  const chromeApi = {
    runtime: createRuntimeBase(
      async () => barcodeDocumentContext(),
      async (message) => {
        if (message.type === PING) return { ok: true, target: OFFSCREEN_TARGET };
        assert.equal(message.type, DECODE);
        decodeCalls += 1;
        if (decodeCalls === 1) {
          throw new Error('Could not establish connection. Receiving end does not exist.');
        }
        return { ok: true, requestId: message.requestId, results: [{ text: 'retried' }] };
      }
    ),
    offscreen: {
      async closeDocument() {
        closeCalls += 1;
      },
      async createDocument() {
        createCalls += 1;
      }
    }
  };

  await withMockBrowser({ chromeApi }, async (image) => {
    const { decodeBarcodeInOffscreen } = await importFreshClient('transport-retry');
    const results = await decodeBarcodeInOffscreen(image);
    assert.deepEqual(results, [{ text: 'retried' }]);
  });

  assert.equal(decodeCalls, 2, 'the decode RPC should be attempted exactly twice');
  assert.equal(closeCalls, 1, 'transport recovery should close the document exactly once');
  assert.equal(createCalls, 1, 'transport recovery should create the document exactly once');
}

async function testReadyRecoveryDefersWhileDecodeIsActive() {
  let pingIsReady = true;
  let closeCalls = 0;
  let createCalls = 0;
  let resolveFirstDecode;
  let signalFirstDecodeStarted;
  const firstDecodeStarted = new Promise((resolve) => {
    signalFirstDecodeStarted = resolve;
  });

  const chromeApi = {
    runtime: createRuntimeBase(
      async () => barcodeDocumentContext(),
      (message) => {
        if (message.type === PING) {
          return Promise.resolve(
            pingIsReady ? { ok: true, target: OFFSCREEN_TARGET } : { ok: false }
          );
        }
        assert.equal(message.type, DECODE);
        assert.equal(resolveFirstDecode, undefined, 'the second request must not reach decode');
        signalFirstDecodeStarted();
        return new Promise((resolve) => {
          resolveFirstDecode = () => resolve({
            ok: true,
            requestId: message.requestId,
            results: [{ text: 'first' }]
          });
        });
      }
    ),
    offscreen: {
      async closeDocument() {
        closeCalls += 1;
      },
      async createDocument() {
        createCalls += 1;
      }
    }
  };

  await withMockBrowser({ chromeApi }, async (image) => {
    const { decodeBarcodeInOffscreen } = await importFreshClient('active-rpc-recovery');
    const firstRequest = decodeBarcodeInOffscreen(image);
    await firstDecodeStarted;
    pingIsReady = false;

    await assert.rejects(
      decodeBarcodeInOffscreen(image),
      (error) => {
        assert.equal(error.code, 'BARCODE_OFFSCREEN_RECOVERY_DEFERRED');
        return true;
      }
    );

    assert.equal(closeCalls, 0, 'recovery must not close a document with an active decode RPC');
    assert.equal(createCalls, 0, 'deferred recovery must not recreate the document');
    resolveFirstDecode();
    assert.deepEqual(await firstRequest, [{ text: 'first' }]);
  });
}

async function testApplicationWorkerErrorDoesNotRetry() {
  let decodeCalls = 0;
  let closeCalls = 0;
  let createCalls = 0;
  const chromeApi = {
    runtime: createRuntimeBase(
      async () => barcodeDocumentContext(),
      async (message) => {
        if (message.type === PING) return { ok: true, target: OFFSCREEN_TARGET };
        assert.equal(message.type, DECODE);
        decodeCalls += 1;
        return {
          ok: false,
          requestId: message.requestId,
          code: 'BARCODE_WORKER_DECODE_FAILED',
          error: 'worker could not decode the image'
        };
      }
    ),
    offscreen: {
      async closeDocument() {
        closeCalls += 1;
      },
      async createDocument() {
        createCalls += 1;
      }
    }
  };

  await withMockBrowser({ chromeApi }, async (image) => {
    const { decodeBarcodeInOffscreen } = await importFreshClient('application-error');
    await assert.rejects(
      decodeBarcodeInOffscreen(image),
      (error) => {
        assert.equal(error.code, 'BARCODE_WORKER_DECODE_FAILED');
        return true;
      }
    );
  });

  assert.equal(decodeCalls, 1, 'application-level Worker errors must not retry');
  assert.equal(closeCalls, 0, 'application-level Worker errors must not recover the document');
  assert.equal(createCalls, 0, 'application-level Worker errors must not recreate the document');
}

const tests = [
  ['PNG encoding precedes offscreen creation', testEncodingPrecedesOffscreenCreation],
  ['receiving-end disconnect recovers and retries once', testReceivingEndDisconnectRetriesOnce],
  ['active decode RPC defers ready recovery', testReadyRecoveryDefersWhileDecodeIsActive],
  ['application-level Worker errors do not retry', testApplicationWorkerErrorDoesNotRetry]
];

for (const [name, test] of tests) {
  await test();
  console.log(`ok - ${name}`);
}

console.log(`ok - ${tests.length} barcode offscreen client checks passed`);
