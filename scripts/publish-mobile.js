// Usage: npm run publish-mobile
// Publishes the mobile/ folder to the repo's gh-pages branch, served by GitHub Pages at
// https://<owner>.github.io/<repo>/. Installed phones pick up the new version the next time they open.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const { owner, repo } = (pkg.build.publish || [])[0] || {};
if (!owner || !repo) {
  console.error('No GitHub repo configured. Run: npm run set-repo -- <owner>/<repo>');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'garage-pages-'));
fs.cpSync(path.join(root, 'mobile'), tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, '.nojekyll'), ''); // serve files as-is

const git = (...args) => execFileSync('git', args, { cwd: tmp, stdio: 'inherit' });
git('init', '-q', '-b', 'gh-pages');
git('add', '-A');
git('commit', '-q', '-m', `Mobile app ${pkg.version}`);
// The branch only ever holds the latest build, so it is replaced rather than appended to.
git('push', '-q', '--force', `https://github.com/${owner}/${repo}.git`, 'gh-pages');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Published mobile app ${pkg.version} to https://${owner}.github.io/${repo}/`);
