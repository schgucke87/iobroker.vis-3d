/**
 * Raises the version in package.json and io-package.json and adds a news
 * entry (shown in the ioBroker admin):
 *
 *   npm run bump -- minor "Deutscher Text" "English text"
 *   npm run bump -- patch "Fehler behoben" "Bug fixed"
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [level = 'patch', de, en] = process.argv.slice(2);
if (!['major', 'minor', 'patch'].includes(level) || !de) {
    console.error('usage: npm run bump -- <major|minor|patch> "<news de>" ["<news en>"]');
    process.exit(1);
}
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const io = JSON.parse(readFileSync('io-package.json', 'utf8'));
const [ma, mi, pa] = pkg.version.split('.').map(Number);
const version = level === 'major' ? `${ma + 1}.0.0` : level === 'minor' ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`;

pkg.version = version;
io.common.version = version;
// newest first, at most 20 entries (the admin's limit for news)
const news = Object.entries(io.common.news ?? {});
io.common.news = Object.fromEntries([[version, { en: en ?? de, de }], ...news].slice(0, 20));

writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
lock.version = version;
if (lock.packages?.['']) lock.packages[''].version = version;
writeFileSync('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
writeFileSync('io-package.json', `${JSON.stringify(io, null, 2)}\n`);
console.log(`version ${version}`);
