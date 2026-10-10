'use strict';
const assert = require('node:assert/strict');
const { parseReport } = require('./shikimori-to-animego.user.js');

// RU: старые отчёты v1 восстанавливаются, новый формат привязывает подтверждение оценки к баллу.
// EN: legacy v1 reports remain readable, and rating confirmation is bound to its numeric score.
const entry = {
  sourceIndex: 0, title: 'Synthetic Anime', russian: '', status: 'completed',
  score: 8, episodes: 12, result: 'imported', chosen: '9001',
  candidates: [{ id: '9001', title: 'Synthetic Anime', original: 'Synthetic Anime',
    href: '/anime/synthetic-anime-9001' }],
  ratingResult: 'done', ratingNote: 'Verified / Проверено'
};
const file = { version: 1, items: [entry], skipped: [] };

assert.equal(parseReport(file).items[0].ratingResult, 'done', 'Legacy score confirmed');
assert.equal(parseReport({ ...file, items: [{...entry, ratingScore: 8}]}).items[0].ratingResult,
  'done', 'Matching score confirmed');
assert.equal(parseReport({ ...file, items: [{...entry, ratingScore: 9}]}).items[0].ratingResult,
  'pending', 'Score changed: do not silently treat rating as confirmed');
assert.equal(parseReport({ ...file, items: [{...entry, result: 'pending', ratingResult: 'pending'}]}).items[0].ratingResult,
  'pending', 'Pending rating stays pending');
assert.equal(parseReport({ ...file, items: [{...entry, chosen: '', ratingResult: 'done'}]}).items[0].chosen,
  '9001', 'Unique exact match restored');
console.log('PASS: v1 report compatibility, confirmed score consistency / Совместимость JSON');
