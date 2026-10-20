import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runCommand } from './process.mjs';

async function git(args) {
  const run = await runCommand('git', args);
  if (run.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${(run.stderr || run.error?.message || '').trim()}`);
  return run.stdout;
}

function numbered(cwd, path) {
  const lines = readFileSync(join(cwd, path), 'utf8').replace(/\n$/, '').split('\n');
  return [`File: ${path}`, ...lines.map((line, i) => `${i + 1} | ${line}`)].join('\n');
}

async function target(cwd) {
  if ((await git(['status', '--porcelain'])).trim() === '') {
    const files = (await git(['ls-files', '-z'])).split('\0').filter(Boolean);
    return {
      scope: 'The target is every tracked file of this repository at HEAD. Each file is shown whole after its "File:" line, with its 1-based line number before each line.',
      body: files.map((path) => numbered(cwd, path)).join('\n\n'),
    };
  }
  return {
    scope: 'The target is the uncommitted change in this repository, shown below as the output of git diff HEAD. Line numbers are the new-file line numbers the hunk headers give.',
    body: await git(['diff', 'HEAD']),
  };
}

export async function reviewPrompt(cwd, focus) {
  const { scope, body } = await target(cwd);
  return [
    `Review the code below for defects. ${scope}`,
    'The whole review target is included in this message, so no command, tool or subagent is needed: do not run or read anything, and do not change any file.',
    'Answer only with the JSON object your response schema defines. Give one finding per problem, most serious first. For each finding, set file to the repository-relative path of the file as shown below, line to the 1-based line number of the code the finding is about, claim to what is wrong, evidence to the code you checked, and verdict to defect, risk or question. If you find no problem, return an empty findings list.',
    ...(focus ? [`Focus: ${focus}`] : []),
    body,
  ].join('\n\n');
}
