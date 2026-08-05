import {
  BARCODE_OFFSCREEN_DECODE,
  BARCODE_OFFSCREEN_DOCUMENT,
  BARCODE_OFFSCREEN_PING,
  BARCODE_OFFSCREEN_TARGET
} from './barcodeOffscreenProtocol.js';

const BARCODE_IMAGE_MAX_PIXELS = 3000000;
const BARCODE_IMAGE_MAX_DATA_URL_LENGTH = 20 * 1024 * 1024;
const BARCODE_IMAGE_ENCODE_TIMEOUT_MS = 6000;
const BARCODE_OFFSCREEN_READY_ATTEMPTS = 12;
const BARCODE_OFFSCREEN_READY_RETRY_MS = 50;
const BARCODE_OFFSCREEN_PING_TIMEOUT_MS = 250;
const BARCODE_OFFSCREEN_API_TIMEOUT_MS = 3000;
const BARCODE_OFFSCREEN_RESPONSE_GRACE_MS = 12000;
const BARCODE_OFFSCREEN_TOTAL_TIMEOUT_MS = 26000;

let creatingOffscreenDocument = null;
let recoveringOffscreenDocument = null;
const activeDecodeRpcLeases = new Set();

export class BarcodeOffscreenError extends Error {
  constructor(message, code, cause = null) {
    super(message);
    this.name = 'BarcodeOffscreenError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function getErrorMessage(error) {
  return String(error?.message || error || '未知错误');
}

function createError(message, code, cause = null) {
  return new BarcodeOffscreenError(message, code, cause);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, createTimeoutError) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(createTimeoutError()), timeoutMs);
    })
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function withOffscreenApiTimeout(promise, operation) {
  return withTimeout(
    promise,
    BARCODE_OFFSCREEN_API_TIMEOUT_MS,
    () => createError(
      `条码识别后台页面${operation}超时（${BARCODE_OFFSCREEN_API_TIMEOUT_MS}ms），请重试。`,
      'BARCODE_OFFSCREEN_API_TIMEOUT'
    )
  );
}

async function getOffscreenDocumentState(chromeApi) {
  const documentUrl = chromeApi.runtime.getURL(BARCODE_OFFSCREEN_DOCUMENT);
  if (typeof chromeApi.runtime.getContexts === 'function') {
    const contexts = await withOffscreenApiTimeout(
      chromeApi.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }),
      '状态检查'
    );
    const offscreenContexts = Array.isArray(contexts) ? contexts : [];
    return {
      exists: offscreenContexts.length > 0,
      isBarcodeDocument: offscreenContexts.some((context) => context.documentUrl === documentUrl)
    };
  }

  if (typeof globalThis.clients?.matchAll === 'function') {
    const matchedClients = await withOffscreenApiTimeout(
      globalThis.clients.matchAll(),
      '状态检查'
    );
    if (matchedClients.some((client) => client.url === documentUrl)) {
      return { exists: true, isBarcodeDocument: true };
    }
  }

  if (typeof chromeApi.offscreen?.hasDocument === 'function') {
    const exists = await withOffscreenApiTimeout(
      chromeApi.offscreen.hasDocument(),
      '状态检查'
    );
    return { exists, isBarcodeDocument: !exists ? false : null };
  }

  return { exists: false, isBarcodeDocument: false };
}

function isExistingOffscreenError(error) {
  return /single offscreen document|offscreen document.*already exists/i.test(getErrorMessage(error));
}

async function waitForOffscreenReady(chromeApi) {
  let lastError = null;
  for (let attempt = 0; attempt < BARCODE_OFFSCREEN_READY_ATTEMPTS; attempt += 1) {
    try {
      const response = await withTimeout(
        chromeApi.runtime.sendMessage({
          target: BARCODE_OFFSCREEN_TARGET,
          type: BARCODE_OFFSCREEN_PING
        }),
        BARCODE_OFFSCREEN_PING_TIMEOUT_MS,
        () => createError('条码识别后台页面响应超时', 'BARCODE_OFFSCREEN_NOT_READY')
      );
      if (response?.ok && response.target === BARCODE_OFFSCREEN_TARGET) return;
    } catch (error) {
      lastError = error;
    }
    await delay(BARCODE_OFFSCREEN_READY_RETRY_MS);
  }

  const detail = lastError ? `：${getErrorMessage(lastError)}` : '';
  throw createError(
    `条码识别后台页面未就绪${detail}，请重新加载扩展后重试。`,
    'BARCODE_OFFSCREEN_NOT_READY',
    lastError
  );
}

async function createOffscreenDocument(chromeApi) {
  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = withOffscreenApiTimeout(
      Promise.resolve().then(() => chromeApi.offscreen.createDocument({
        url: BARCODE_OFFSCREEN_DOCUMENT,
        reasons: ['WORKERS'],
        justification: '在独立 Worker 中运行本地 ZXing 条码识别，避免阻塞扩展后台。'
      })),
      '创建'
    ).catch((error) => {
      if (isExistingOffscreenError(error)) return;
      if (error instanceof BarcodeOffscreenError) throw error;
      throw createError(
        `条码识别后台页面创建失败：${getErrorMessage(error)}`,
        'BARCODE_OFFSCREEN_CREATE_FAILED',
        error
      );
    }).finally(() => {
      creatingOffscreenDocument = null;
    });
  }
  await creatingOffscreenDocument;
}

function assertNoOffscreenConflict(state) {
  if (state.exists && state.isBarcodeDocument === false) {
    throw createError(
      '另一个扩展后台页面正在运行，无法启动条码识别服务。请重新加载扩展后重试。',
      'BARCODE_OFFSCREEN_CONFLICT'
    );
  }
}

async function recoverOffscreenDocument(chromeApi, readyError) {
  if (!recoveringOffscreenDocument) {
    recoveringOffscreenDocument = (async () => {
      let state = { exists: false, isBarcodeDocument: false };
      try {
        state = await getOffscreenDocumentState(chromeApi);
      } catch {
        state = { exists: true, isBarcodeDocument: null };
      }
      assertNoOffscreenConflict(state);

      if (state.exists) {
        if (activeDecodeRpcLeases.size) {
          throw createError(
            '条码识别后台页面暂时不可用，其他识别任务仍在运行，请稍后重试。',
            'BARCODE_OFFSCREEN_RECOVERY_DEFERRED',
            readyError
          );
        }
        try {
          await withOffscreenApiTimeout(
            Promise.resolve().then(() => chromeApi.offscreen.closeDocument()),
            '关闭'
          );
        } catch (error) {
          throw createError(
            `条码识别后台页面恢复失败：${getErrorMessage(error)}`,
            'BARCODE_OFFSCREEN_RECOVERY_FAILED',
            error
          );
        }
      }
      await createOffscreenDocument(chromeApi);
      await waitForOffscreenReady(chromeApi);
    })().catch((error) => {
      if (error instanceof BarcodeOffscreenError) throw error;
      throw createError(
        `条码识别后台页面恢复失败：${getErrorMessage(error)}`,
        'BARCODE_OFFSCREEN_RECOVERY_FAILED',
        readyError || error
      );
    }).finally(() => {
      recoveringOffscreenDocument = null;
    });
  }
  await recoveringOffscreenDocument;
}

async function ensureOffscreenDocument() {
  const chromeApi = globalThis.chrome;
  if (!chromeApi?.runtime?.sendMessage || !chromeApi?.offscreen?.createDocument) {
    throw createError(
      '当前 Chrome 环境不支持离屏条码识别，请升级到 Chrome 109 或更高版本。',
      'BARCODE_OFFSCREEN_UNAVAILABLE'
    );
  }
  if (recoveringOffscreenDocument) {
    await recoveringOffscreenDocument;
    return chromeApi;
  }

  let state = { exists: false, isBarcodeDocument: false };
  try {
    state = await getOffscreenDocumentState(chromeApi);
  } catch {
    state = { exists: false, isBarcodeDocument: false };
  }
  assertNoOffscreenConflict(state);

  if (!state.exists) {
    await createOffscreenDocument(chromeApi);
  }

  try {
    await waitForOffscreenReady(chromeApi);
  } catch (error) {
    await recoverOffscreenDocument(chromeApi, error);
  }
  return chromeApi;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function imageDataToPngDataUrl(image) {
  const width = Number(image?.width || 0);
  const height = Number(image?.height || 0);
  const pixelCount = width * height;
  const source = image?.data;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width <= 0 || height <= 0 || pixelCount > BARCODE_IMAGE_MAX_PIXELS
    || !source || Number(source.length || 0) < pixelCount * 4) {
    throw createError('条码识别图像数据无效，请重新截图后重试。', 'BARCODE_IMAGE_INVALID');
  }
  if (typeof OffscreenCanvas === 'undefined') {
    throw createError('当前 Chrome 环境不支持离屏图像处理。', 'BARCODE_OFFSCREEN_UNAVAILABLE');
  }

  try {
    const startedAt = Date.now();
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建离屏画布上下文');
    const preparedImage = typeof ImageData !== 'undefined' && image instanceof ImageData
      ? image
      : new ImageData(new Uint8ClampedArray(source || []), width, height);
    context.putImageData(preparedImage, 0, 0);
    const blob = await withTimeout(
      canvas.convertToBlob({ type: 'image/png' }),
      BARCODE_IMAGE_ENCODE_TIMEOUT_MS,
      () => createError(
        `条码识别图像准备超时（${BARCODE_IMAGE_ENCODE_TIMEOUT_MS}ms），请缩小框选区域后重试。`,
        'BARCODE_IMAGE_ENCODE_TIMEOUT'
      )
    );
    const remainingMs = BARCODE_IMAGE_ENCODE_TIMEOUT_MS - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      throw createError(
        `条码识别图像准备超时（${BARCODE_IMAGE_ENCODE_TIMEOUT_MS}ms），请缩小框选区域后重试。`,
        'BARCODE_IMAGE_ENCODE_TIMEOUT'
      );
    }
    const buffer = await withTimeout(
      Promise.resolve().then(() => blob.arrayBuffer()),
      remainingMs,
      () => createError(
        `条码识别图像准备超时（${BARCODE_IMAGE_ENCODE_TIMEOUT_MS}ms），请缩小框选区域后重试。`,
        'BARCODE_IMAGE_ENCODE_TIMEOUT'
      )
    );
    const dataUrl = `data:${blob.type || 'image/png'};base64,${arrayBufferToBase64(buffer)}`;
    if (Date.now() - startedAt > BARCODE_IMAGE_ENCODE_TIMEOUT_MS) {
      throw createError(
        `条码识别图像准备超时（${BARCODE_IMAGE_ENCODE_TIMEOUT_MS}ms），请缩小框选区域后重试。`,
        'BARCODE_IMAGE_ENCODE_TIMEOUT'
      );
    }
    if (dataUrl.length > BARCODE_IMAGE_MAX_DATA_URL_LENGTH) {
      throw createError('条码识别图像过大，请缩小框选区域后重试。', 'BARCODE_IMAGE_TOO_LARGE');
    }
    return dataUrl;
  } catch (error) {
    if (error instanceof BarcodeOffscreenError) throw error;
    throw createError(
      `条码识别图像准备失败：${getErrorMessage(error)}`,
      'BARCODE_IMAGE_ENCODE_FAILED',
      error
    );
  }
}

function createRequestId() {
  return `barcode_offscreen_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createTotalTimeoutError() {
  return createError(
    `条码识别总耗时达到上限（${BARCODE_OFFSCREEN_TOTAL_TIMEOUT_MS}ms），已停止本次任务，请重试或缩小框选区域。`,
    'BARCODE_OFFSCREEN_TOTAL_TIMEOUT'
  );
}

function isRetryableTransportError(error) {
  if (error instanceof BarcodeOffscreenError) return false;
  const message = getErrorMessage(error);
  if (/extension context invalidated/i.test(message)) return false;
  return /receiving end does not exist|could not establish connection|no matching message handler|message (?:port|channel) closed before a response|asynchronous response.*(?:port|channel) closed/i.test(message);
}

async function sendDecodeRequest(chromeApi, message, responseTimeoutMs) {
  const lease = Symbol(message.requestId);
  activeDecodeRpcLeases.add(lease);
  let rawResponse;
  try {
    rawResponse = chromeApi.runtime.sendMessage(message);
  } catch (error) {
    activeDecodeRpcLeases.delete(lease);
    throw error;
  }
  Promise.resolve(rawResponse).finally(() => {
    activeDecodeRpcLeases.delete(lease);
  }).catch(() => {});

  try {
    return await withTimeout(
      rawResponse,
      responseTimeoutMs,
      () => createError(
        `条码识别服务响应超时（${responseTimeoutMs}ms），请重试或缩小框选区域。`,
        'BARCODE_OFFSCREEN_RESPONSE_TIMEOUT'
      )
    );
  } finally {
    activeDecodeRpcLeases.delete(lease);
  }
}

function unwrapDecodeResponse(response, requestId) {
  if (!response || response.requestId !== requestId || typeof response.ok !== 'boolean') {
    throw createError('条码识别服务返回了无效响应，请重新加载扩展后重试。', 'BARCODE_OFFSCREEN_PROTOCOL_ERROR');
  }
  if (!response.ok) {
    throw createError(
      response.error || '条码识别 Worker 执行失败',
      response.code || 'BARCODE_WORKER_DECODE_FAILED'
    );
  }
  return Array.isArray(response.results) ? response.results : [];
}

export async function decodeBarcodeInOffscreen(image, options = {}, timeoutMs = 8000) {
  const deadlineAt = Date.now() + BARCODE_OFFSCREEN_TOTAL_TIMEOUT_MS;
  const dataUrl = await imageDataToPngDataUrl(image);
  const setupRemainingMs = deadlineAt - Date.now();
  if (setupRemainingMs <= 0) throw createTotalTimeoutError();
  const chromeApi = await withTimeout(
    ensureOffscreenDocument(),
    setupRemainingMs,
    createTotalTimeoutError
  );
  const workerTimeoutMs = Math.min(30000, Math.max(1000, Number(timeoutMs) || 8000));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs < workerTimeoutMs + 1000) {
      throw createTotalTimeoutError();
    }
    const requestId = createRequestId();
    const responseTimeoutMs = Math.min(
      workerTimeoutMs + BARCODE_OFFSCREEN_RESPONSE_GRACE_MS,
      remainingMs
    );
    try {
      const response = await sendDecodeRequest(chromeApi, {
        target: BARCODE_OFFSCREEN_TARGET,
        type: BARCODE_OFFSCREEN_DECODE,
        requestId,
        dataUrl,
        options,
        timeoutMs: workerTimeoutMs
      }, responseTimeoutMs);
      return unwrapDecodeResponse(response, requestId);
    } catch (error) {
      if (attempt === 0 && isRetryableTransportError(error)) {
        const recoveryRemainingMs = deadlineAt - Date.now();
        if (recoveryRemainingMs <= 0) throw createTotalTimeoutError();
        await withTimeout(
          recoverOffscreenDocument(chromeApi, error),
          recoveryRemainingMs,
          createTotalTimeoutError
        );
        continue;
      }
      if (error instanceof BarcodeOffscreenError) throw error;
      throw createError(
        `条码识别服务通信失败：${getErrorMessage(error)}`,
        'BARCODE_OFFSCREEN_MESSAGE_FAILED',
        error
      );
    }
  }
  throw createError('条码识别服务通信失败，请重试。', 'BARCODE_OFFSCREEN_MESSAGE_FAILED');
}
