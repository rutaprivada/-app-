const fs = require('fs');

// 1. sw.js
let sw = fs.readFileSync('sw.js', 'utf8');
sw = sw.replace(/rutaprivada-v\d+/g, 'rutaprivada-v140');
sw = sw.replace(/const CACHE_NAME = 'rutaprivada-v\d+';/, "const CACHE_NAME = 'rutaprivada-v140';");
fs.writeFileSync('sw.js', sw, 'utf8');
console.log('sw.js updated to v140');

// 2. index.html
let index = fs.readFileSync('index.html', 'utf8');
index = index.replace(/app\.js\?v=\d+/g, 'app.js?v=140');
index = index.replace(/sync\.js\?v=\d+/g, 'sync.js?v=140');
index = index.replace(/styles\.css\?v=\d+/g, 'styles.css?v=140');
fs.writeFileSync('index.html', index, 'utf8');
console.log('index.html updated to v140');

// 3. conductor.html
let cond = fs.readFileSync('conductor.html', 'utf8');
cond = cond.replace(/conductor\.js\?v=\d+/g, 'conductor.js?v=140');
cond = cond.replace(/sync\.js\?v=\d+/g, 'sync.js?v=140');
cond = cond.replace(/conductor\.css\?v=\d+/g, 'conductor.css?v=140');
fs.writeFileSync('conductor.html', cond, 'utf8');
console.log('conductor.html updated to v140');

