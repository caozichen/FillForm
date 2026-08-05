import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import zxingReaderWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

prepareZXingModule?.({
  overrides: {
    locateFile: (path, prefix) => (
      String(path || '').endsWith('.wasm')
        ? zxingReaderWasmUrl
        : `${prefix || ''}${path || ''}`
    )
  }
});

self.onmessage = async (event) => {
  const { id, image, options } = event.data || {};
  try {
    let input = null;
    if (typeof image?.dataUrl === 'string') {
      const response = await fetch(image.dataUrl);
      input = await response.blob();
    } else {
      input = {
        data: new Uint8ClampedArray(image.data),
        width: image.width,
        height: image.height
      };
    }
    const decoded = await readBarcodes(
      input,
      options || {}
    );
    const decodedItems = Array.isArray(decoded) ? decoded : [];
    const validItems = decodedItems.filter((result) => result?.isValid !== false && !result?.error);
    if (!validItems.length) {
      const decodeError = decodedItems.find((result) => result?.error)?.error;
      if (decodeError) throw new Error(String(decodeError));
    }
    self.postMessage({
      id,
      ok: true,
      results: decodedItems.map((result) => ({
        text: result?.text || '',
        format: result?.format || '',
        symbology: result?.symbology || '',
        isValid: result?.isValid,
        error: result?.error ? String(result.error) : '',
        position: result?.position || null
      }))
    });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      code: error?.code || 'BARCODE_WASM_DECODE_FAILED',
      error: String(error?.message || error || '条码识别 Worker 执行失败')
    });
  }
};
