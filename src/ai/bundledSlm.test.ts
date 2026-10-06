import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { addNoCompress, ASSET_PATH } = require('../../plugins/withBundledSlm.js') as {
  addNoCompress: (gradle: string) => string;
  ASSET_PATH: string;
};

describe('withBundledSlm gradle edit', () => {
  it('adds noCompress inside an existing androidResources block', () => {
    const out = addNoCompress("android {\n    androidResources {\n        ignoreAssetsPattern 'x'\n    }\n}\n");
    expect(out).toContain("androidResources {\n        noCompress 'gguf'\n        ignoreAssetsPattern");
  });

  it('creates the block before buildTypes when there is none', () => {
    const out = addNoCompress('android {\n    buildTypes {\n    }\n}\n');
    expect(out).toMatch(/androidResources \{\n\s+noCompress 'gguf'\n\s+\}\n\s+buildTypes/);
  });

  it('is idempotent', () => {
    const once = addNoCompress('android {\n    androidResources {\n    }\n}\n');
    expect(addNoCompress(once)).toBe(once);
  });

  it('uses an asset path under slm/', () => {
    expect(ASSET_PATH).toBe('slm/model.gguf');
  });
});
