import BarcodeZxingWorker from '../../legacy/barcodeZxingWorker.js?worker';
import {
  BARCODE_OFFSCREEN_DECODE,
  BARCODE_OFFSCREEN_PING,
  BARCODE_OFFSCREEN_TARGET
} from '../../legacy/barcodeOffscreenProtocol.js';

const MIN_WORKER_TIMEOUT_MS = 1000;
const MAX_WORKER_TIMEOUT_MS = 30000;
const MAX_CONCURRENT_WORKERS = 2;
const MAX_QUEUED_REQUESTS = 2;

let activeWorkerCount = 0;
const decodeQueue = [];

function getErrorMessage(error) {
  return String(error?.message || error || '未知错误');
}

function decodeWithWorker({ requestId, dataUrl, options = {}, timeoutMs = 8000 }) {
  const safeTimeoutMs = Math.min(
    MAX_WORKER_TIMEOUT_MS,
    Math.max(MIN_WORKER_TIMEOUT_MS, Number(timeoutMs) || 8000)
  );
  if (typeof BarcodeZxingWorker !== 'function' || typeof globalThis.Worker !== 'function') {
    return Promise.reject({
      code: 'BARCODE_WORKER_UNAVAILABLE',
      message: '当前 Chrome 环境不支持条码识别 Worker。'
    });
  }
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
    return Promise.reject({
      code: 'BARCODE_IMAGE_INVALID',
      message: '条码识别图像数据无效，请重新截图后重试。'
    });
  }

  let worker;
  try {
    worker = new BarcodeZxingWorker();
  } catch (error) {
    return Promise.reject({
      code: 'BARCODE_WORKER_LOAD_FAILED',
      message: `条码识别 Worker 启动失败：${getErrorMessage(error)}`
    });
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };

    timer = setTimeout(() => {
      finish(reject, {
        code: 'BARCODE_WASM_TIMEOUT',
        message: `条码识别超时（${safeTimeoutMs}ms），已终止本次解码任务，请重试或缩小框选区域。`
      });
    }, safeTimeoutMs);
    worker.onmessage = (event) => {
      const payload = event.data || {};
      if (payload.id !== requestId) return;
      if (payload.ok) {
        finish(resolve, Array.isArray(payload.results) ? payload.results : []);
      } else {
        finish(reject, {
          code: payload.code || 'BARCODE_WORKER_DECODE_FAILED',
          message: payload.error || '条码识别 Worker 执行失败'
        });
      }
    };
    worker.onerror = (event) => {
      event?.preventDefault?.();
      finish(reject, {
        code: 'BARCODE_WORKER_LOAD_FAILED',
        message: event?.message || '条码识别 Worker 加载失败'
      });
    };
    worker.onmessageerror = () => {
      finish(reject, {
        code: 'BARCODE_WORKER_MESSAGE_FAILED',
        message: '条码识别 Worker 消息传输失败'
      });
    };
    try {
      worker.postMessage({
        id: requestId,
        image: { dataUrl },
        options
      });
    } catch (error) {
      finish(reject, {
        code: 'BARCODE_WORKER_MESSAGE_FAILED',
        message: `条码识别 Worker 消息发送失败：${getErrorMessage(error)}`
      });
    }
  });
}

function drainDecodeQueue() {
  while (activeWorkerCount < MAX_CONCURRENT_WORKERS && decodeQueue.length) {
    const task = decodeQueue.shift();
    activeWorkerCount += 1;
    void decodeWithWorker(task.message).then(task.resolve, task.reject).finally(() => {
      activeWorkerCount -= 1;
      drainDecodeQueue();
    });
  }
}

function scheduleDecode(message) {
  if (activeWorkerCount >= MAX_CONCURRENT_WORKERS && decodeQueue.length >= MAX_QUEUED_REQUESTS) {
    return Promise.reject({
      code: 'BARCODE_WORKER_BUSY',
      message: '当前条码识别任务较多，请稍后重试。'
    });
  }
  return new Promise((resolve, reject) => {
    decodeQueue.push({ message, resolve, reject });
    drainDecodeQueue();
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.target !== BARCODE_OFFSCREEN_TARGET) return false;
  if (message.type === BARCODE_OFFSCREEN_PING) {
    sendResponse({ ok: true, target: BARCODE_OFFSCREEN_TARGET });
    return false;
  }
  if (message.type !== BARCODE_OFFSCREEN_DECODE) return false;

  void scheduleDecode(message).then((results) => {
    sendResponse({ ok: true, requestId: message.requestId, results });
  }).catch((error) => {
    sendResponse({
      ok: false,
      requestId: message.requestId,
      code: error?.code || 'BARCODE_WORKER_DECODE_FAILED',
      error: getErrorMessage(error)
    });
  });
  return true;
});
