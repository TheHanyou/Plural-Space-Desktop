const { execSync } = require('child_process');
const os = require('os');

if (os.platform() !== 'win32') {
  try {
    execSync('chmod -R +x node_modules/.bin', { stdio: 'inherit' });
  } catch (e) {
    process.exit(0);
  }
}
