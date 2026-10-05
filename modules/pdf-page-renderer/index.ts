// JS side of the local PdfPageRenderer Expo module (Android PdfRenderer). Needs a dev-client build.
import { requireNativeModule } from 'expo';

export interface RenderedPage {
  /** file:// URI of a PNG in the app cache. Delete it after OCR. */
  uri: string;
  width: number;
  height: number;
}

interface PdfPageRendererModule {
  getPageCount(uri: string): Promise<number>;
  renderPage(uri: string, pageIndex: number, dpi: number): Promise<RenderedPage>;
}

const native = requireNativeModule<PdfPageRendererModule>('PdfPageRenderer');

/** 200 dpi gives 8 pt print a 22 px em, above the 16 px per character ML Kit asks for. */
export const DEFAULT_DPI = 200;

export const getPageCount = (uri: string) => native.getPageCount(uri);
export const renderPage = (uri: string, pageIndex: number, dpi = DEFAULT_DPI) =>
  native.renderPage(uri, pageIndex, dpi);

// Second native module in this package: file helpers for ingestion (IngestFilesModule.kt).
interface IngestFilesModule {
  prepareImage(uri: string, maxSide: number): Promise<RenderedPage>;
  sha256(uri: string): Promise<string>;
  setSecure(enabled: boolean): Promise<void>;
}

const files = requireNativeModule<IngestFilesModule>('IngestFiles');

/** Same cap as the PDF renderer: a 12 MP photo keeps its detail, a 50 MP one is scaled down. */
export const MAX_IMAGE_SIDE = 4000;

/** Upright (EXIF applied), alpha flattened onto white, long side capped. Returns a cache JPEG; delete it after OCR. */
export const prepareImage = (uri: string, maxSide = MAX_IMAGE_SIDE) => files.prepareImage(uri, maxSide);
/** Lowercase hex SHA-256 of a file:// or content:// URI, streamed natively. */
export const sha256File = (uri: string) => files.sha256(uri);
/** Sets or clears FLAG_SECURE on the app window (no screenshots, blank in recents). */
export const setSecure = (enabled: boolean) => files.setSecure(enabled);
