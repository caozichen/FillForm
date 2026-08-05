import { decodeBarcodeInOffscreen } from '../legacy/barcodeOffscreenClient.js';

export default defineUnlistedScript(() => {
  globalThis.FormPilotBarcodeOffscreenDecode = decodeBarcodeInOffscreen;
});
