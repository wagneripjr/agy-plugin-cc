const VALUELESS = new Set(['--wait', '--fresh', '--json']);
const VALUED = new Set(['--resume', '--model', '--effort']);

export function parseDelegation(argv) {
  const options = {};
  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (token === '--') {
      i += 1;
      break;
    }
    if (VALUELESS.has(token)) {
      options[token.slice(2)] = true;
      i += 1;
      continue;
    }
    if (VALUED.has(token)) {
      if (i + 1 >= argv.length) return null;
      options[token.slice(2)] = argv[i + 1];
      i += 2;
      continue;
    }
    break;
  }
  return { options, text: argv.slice(i).join(' ') };
}
