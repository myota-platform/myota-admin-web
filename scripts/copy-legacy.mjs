import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const dist = resolve(root, 'dist');
const legacy = resolve(root, 'web');

if (!existsSync(legacy)) throw new Error('The compatibility UI in web/ is missing.');
rmSync(resolve(dist, 'legacy'), { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(legacy, resolve(dist, 'legacy'), { recursive: true });

// The legacy app uses root-relative asset URLs. Keep those assets available
// while Vue routes progressively replace the old screens.
for (const name of ['modules', 'vendor', 'app.js', 'styles.css', 'entity-types.css', 'geodata-imports.css']) {
  const source = resolve(legacy, name);
  if (existsSync(source)) cpSync(source, resolve(dist, name), { recursive: true });
}
