const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const targetDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'public');

['index.html', 'styles.css', 'app.js', 'sync.js'].forEach(file => {
  const src = path.join(srcDir, file);
  const dst = path.join(targetDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`Copied ${file} -> android assets`);
  }
});
