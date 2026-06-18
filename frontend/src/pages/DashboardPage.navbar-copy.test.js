import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./DashboardPage.jsx', import.meta.url), 'utf8');

assert.match(
  source,
  /<span className="dash-logo-sub">with \{companionName\}<\/span>/,
  'mom navbar subtitle should say "with {companionName}"',
);

assert.doesNotMatch(
  source,
  /<span className="dash-logo-sub">for \{companionName\}<\/span>/,
  'mom navbar subtitle should not say "for {companionName}"',
);
