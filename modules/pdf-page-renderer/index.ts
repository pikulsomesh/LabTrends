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
