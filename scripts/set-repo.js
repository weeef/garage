// Usage: npm run set-repo -- yourname/garage-log
// Points the app's updater (GitHub Releases) at your repository.
const fs = require('fs');
const path = require('path');

const arg = (process.argv[2] || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/$/, '');
if (!/^[\w.-]+\/[\w.-]+$/.test(arg)) {
  console.error('Usage: npm run set-repo -- <github-owner>/<repo>\nExample: npm run set-repo -- janedoe/garage-log');
  process.exit(1);
}
const [owner, repo] = arg.split('/');
const file = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.build.publish = [{ provider: 'github', owner, repo, releaseType: 'release' }];
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Updater now points at https://github.com/${owner}/${repo}/releases`);
