import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { resolve, sep } from 'node:path';

const SELF = import.meta.url;
const config = new URL(SELF).searchParams;
const instant = Date.parse(config.get('at') ?? '');
const store = config.get('store');
if (Number.isNaN(instant) || !store) throw new Error(`the clock was loaded without its instant and store: ${SELF}`);

const RealDate = Date;

class FixedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(instant);
    else super(...args);
  }

  static now() {
    return instant;
  }
}

globalThis.Date = FixedDate;

function releaseOnRecord(path) {
  if (globalThis.Date !== FixedDate || typeof path !== 'string') return;
  const target = resolve(path);
  if (target.startsWith(`${store}${sep}`) && target.endsWith('.json')) globalThis.Date = RealDate;
}

for (const [name, destination] of [['renameSync', 1], ['writeFileSync', 0]]) {
  const wrapped = fs[name];
  fs[name] = function (...args) {
    const out = wrapped.apply(this, args);
    releaseOnRecord(args[destination]);
    return out;
  };
}
syncBuiltinESMExports();
