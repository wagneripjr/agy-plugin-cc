const REGEX_PRECEDERS = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', 'return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', '=>', '&&', '||', '??', '==', '===', '!=', '!==']);
const PUNCTUATION = ['===', '!==', '=>', '&&', '||', '??', '==', '!=', '...', '?.'];

function readQuoted(source, start, quote) {
  let i = start + 1;
  let value = '';
  while (i < source.length && source[i] !== quote) {
    if (source[i] === '\\') {
      value += source[i + 1];
      i += 2;
      continue;
    }
    value += source[i];
    i += 1;
  }
  return { value, end: i + 1 };
}

function readTemplate(source, start) {
  let i = start + 1;
  let raw = '';
  let depth = 0;
  let expressions = false;
  while (i < source.length) {
    const c = source[i];
    if (depth === 0 && c === '`') break;
    if (c === '\\') {
      raw += source.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (depth === 0 && c === '$' && source[i + 1] === '{') {
      expressions = true;
      depth = 1;
      raw += '${';
      i += 2;
      continue;
    }
    if (depth > 0 && c === '{') depth += 1;
    if (depth > 0 && c === '}') depth -= 1;
    raw += c;
    i += 1;
  }
  return { raw, expressions, end: i + 1 };
}

function readRegex(source, start) {
  let i = start + 1;
  let inClass = false;
  while (i < source.length) {
    const c = source[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '[') inClass = true;
    if (c === ']') inClass = false;
    if (c === '/' && !inClass) break;
    if (c === '\n') break;
    i += 1;
  }
  i += 1;
  while (/[a-z]/i.test(source[i] ?? '')) i += 1;
  return { end: i };
}

export function tokenize(source) {
  const tokens = [];
  let i = 0;
  const previous = () => tokens.at(-1);
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === '#' && source[i + 1] === '!' && i === 0) {
      i = source.indexOf('\n') === -1 ? source.length : source.indexOf('\n');
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const { value, end } = readQuoted(source, i, c);
      tokens.push({ type: 'string', value, at: i });
      i = end;
      continue;
    }
    if (c === '`') {
      const { raw, expressions, end } = readTemplate(source, i);
      tokens.push({ type: 'template', value: raw, expressions, at: i });
      i = end;
      continue;
    }
    if (c === '/') {
      const before = previous();
      if (!before || (before.type === 'punct' && REGEX_PRECEDERS.has(before.value)) || (before.type === 'word' && REGEX_PRECEDERS.has(before.value))) {
        const { end } = readRegex(source, i);
        tokens.push({ type: 'regex', at: i });
        i = end;
        continue;
      }
    }
    const word = /^[A-Za-z_$][\w$]*/.exec(source.slice(i, i + 200));
    if (word) {
      tokens.push({ type: 'word', value: word[0], at: i });
      i += word[0].length;
      continue;
    }
    const number = /^\d[\w.]*/.exec(source.slice(i, i + 50));
    if (number) {
      tokens.push({ type: 'number', value: number[0], at: i });
      i += number[0].length;
      continue;
    }
    const punct = PUNCTUATION.find((p) => source.startsWith(p, i)) ?? c;
    tokens.push({ type: 'punct', value: punct, at: i });
    i += punct.length;
  }
  return tokens;
}

export function callArguments(tokens, openIndex) {
  const args = [];
  let current = [];
  let depth = 0;
  for (let i = openIndex + 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type === 'punct' && ['(', '[', '{'].includes(token.value)) depth += 1;
    if (token.type === 'punct' && [')', ']', '}'].includes(token.value)) {
      if (depth === 0) {
        if (current.length > 0) args.push(current);
        return args;
      }
      depth -= 1;
    }
    if (depth === 0 && token.type === 'punct' && token.value === ',') {
      args.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  return args;
}

export function lineOf(source, at) {
  return source.slice(0, at).split('\n').length;
}
