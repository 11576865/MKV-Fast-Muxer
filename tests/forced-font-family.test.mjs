import test from 'node:test';
import assert from 'node:assert/strict';
import { preferredAssFontFamily } from '../src/ass-font-rewrite.js';

test('forced-font family prefers stable ASCII aliases when localized names exist', () => {
  const descriptor = {
    family: '汉仪润圆',
    legacyFamily: '汉仪润圆',
    typographicFamily: '汉仪润圆 55W',
    fullName: 'HYRunYuan-55W',
    postScriptName: 'HYRunYuan-55W',
    familyAliases: ['汉仪润圆'],
    aliases: ['汉仪润圆', 'HYRunYuan-55W'],
  };

  assert.equal(preferredAssFontFamily(descriptor), 'HYRunYuan-55W');
});

test('forced-font family keeps normal family when it is already stable', () => {
  const descriptor = {
    family: 'DejaVu Sans',
    legacyFamily: 'DejaVu Sans',
    typographicFamily: '',
    fullName: 'DejaVu Sans',
    postScriptName: 'DejaVuSans',
    familyAliases: ['DejaVu Sans'],
    aliases: ['DejaVu Sans', 'DejaVuSans'],
  };

  assert.equal(preferredAssFontFamily(descriptor), 'DejaVu Sans');
});
