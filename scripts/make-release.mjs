// Assembles the installable adapter (as on the "release" branch) into the given directory:
// the built www/ plus io-package, admin, README and LICENSE, and a package.json without the
// build tooling, so installing it needs no build step and no dev dependencies.
//
// usage: npm run build && node scripts/make-release.mjs <target-dir>
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const target = process.argv[2];
if (!target) {
    console.error('usage: node scripts/make-release.mjs <target-dir>');
    process.exit(1);
}
if (!existsSync('www/index.html')) {
    console.error('www/ is missing – run "npm run build" first');
    process.exit(1);
}

// keep a .git directory if the target is a checkout of the release branch
mkdirSync(target, { recursive: true });
for (const entry of ['www', 'admin', 'io-package.json', 'README.md', 'LICENSE', 'package.json']) {
    rmSync(join(target, entry), { recursive: true, force: true });
}
for (const entry of ['www', 'admin', 'io-package.json', 'README.md', 'LICENSE']) {
    cpSync(entry, join(target, entry), { recursive: true });
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
delete pkg.devDependencies;
delete pkg.scripts;
pkg.files = ['www/', 'admin/', 'io-package.json', 'LICENSE', 'README.md'];
writeFileSync(join(target, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
console.log(`release written to ${target}`);
