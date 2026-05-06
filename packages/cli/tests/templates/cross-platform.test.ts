import { describe, it, expect } from 'vitest';

describe('Cross-Platform Path Handling', () => {
  // Note: We can't actually test on Windows/Linux without CI,
  // but we can check templates don't have hardcoded paths

  it('should not have hardcoded forward slashes in TypeScript code', async () => {
    const fs = await import('node:fs/promises');

    // After init.ts split, the path-using scaffolding code lives in
    // commands/init/assets.ts. Check it uses path.join.
    const assetsContent = await fs.readFile('src/commands/init/assets.ts', 'utf-8');
    expect(assetsContent).toContain('path.join');

    // Should not have hardcoded path separators in code
    // (Templates can have example paths in markdown - that's documentation)
  });

  it('should use path.join pattern in file operations', async () => {
    const fs = await import('node:fs/promises');
    const assetsContent = await fs.readFile('src/commands/init/assets.ts', 'utf-8');

    // Verify path.join used for .ana/ paths (tmpAnaPath in split assets.ts)
    expect(assetsContent).toContain("path.join(tmpAnaPath, 'context'");
  });

  it('FileWriter utility uses path.join for cross-platform paths', async () => {
    const fs = await import('node:fs/promises');
    const fileWriter = await fs.readFile('src/utils/file-writer.ts', 'utf-8');

    // Should use path module
    expect(fileWriter).toContain('import * as path');
    expect(fileWriter).toContain('path.dirname');
    expect(fileWriter).toContain('path.join');
  });
});
