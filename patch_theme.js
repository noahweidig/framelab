const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');
code = code.replace(
  "topFill: '#000000',",
  "topFill: '#1c1c1e',"
);
fs.writeFileSync('src/App.jsx', code);
