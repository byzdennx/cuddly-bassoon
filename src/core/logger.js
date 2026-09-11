'use strict';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m'
};

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const line = (color, tag, msg) =>
  console.log(`${C.gray}${ts()}${C.reset} ${color}${C.bold}[${tag}]${C.reset} ${msg}`);

module.exports = {
  info: (m) => line(C.cyan, 'INFO', m),
  success: (m) => line(C.green, ' OK ', m),
  warn: (m) => line(C.yellow, 'WARN', m),
  error: (m) => line(C.red, 'FAIL', m),
  route: (m) => line(C.magenta, 'ROUTE', m),
  banner() {
    console.log(`
${C.cyan}${C.bold} ______                     _____ _
|  ____|                   /  ___| |
| |__   _ __   __ _ _ __  |  (___ | |_ _ __ ___  __ _ _ __ ___
|  __| | '_ \\ / _\` | '_ \\  \\___  \\| __| '__/ _ \\/ _\` | '_ \` _ \\
| |____| |_) | (_| | | | | ____) | |_| | |  __/ (_| | | | | | |
|______| .__/ \\__,_|_| |_||_____/ \\__|_|  \\___|\\__,_|_| |_| |_|
       | |
       |_|${C.reset} ${C.dim}REST API Platform${C.reset}
`);
  }
};