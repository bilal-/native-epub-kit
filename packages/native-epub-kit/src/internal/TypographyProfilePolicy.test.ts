import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { ResolvedTypographyProfile } from '../records';
import {
  MAXIMUM_TYPOGRAPHY_FONT_FAMILIES,
  MAXIMUM_TYPOGRAPHY_RULES,
  normalizeTypographyProfile,
  typographyProfileStylesheet,
  validateTypographyProfile,
  type TypographyProfileValidation,
} from './TypographyProfilePolicy';

interface TypographyProfileCase {
  availableFontFamilies: string[];
  expected: TypographyProfileValidation;
  name: string;
  profile: unknown;
}

interface TypographyProfileContract {
  cases: TypographyProfileCase[];
  maximumFontFamilies: number;
  maximumRules: number;
  version: number;
}

const contract = JSON.parse(
  readFileSync(
    new URL('../../../testing/contracts/typography-profile-v1/cases.json', import.meta.url),
    'utf8'
  )
) as TypographyProfileContract;

describe('typography-profile-v1 contract', () => {
  it('pins bounded arrays', () => {
    expect(contract.version).toBe(1);
    expect(contract.maximumRules).toBe(MAXIMUM_TYPOGRAPHY_RULES);
    expect(contract.maximumFontFamilies).toBe(MAXIMUM_TYPOGRAPHY_FONT_FAMILIES);
  });

  for (const testCase of contract.cases) {
    it(`validates and compiles ${testCase.name}`, () => {
      expect(
        validateTypographyProfile(testCase.profile, new Set(testCase.availableFontFamilies))
      ).toEqual(testCase.expected);
    });
  }

  it('rejects more than the maximum rule count atomically', () => {
    const rules = Array.from({ length: MAXIMUM_TYPOGRAPHY_RULES + 1 }, () => ({
      direction: 'rtl' as const,
      target: { kind: 'language' as const, value: 'ur' },
    }));
    expect(validateTypographyProfile({ publisherStyles: 'hybrid', rules })).toEqual({
      profile: null,
      status: 'invalid',
      stylesheet: '',
    });
  });

  it('rejects non-finite numbers and returns detached records', () => {
    expect(() =>
      normalizeTypographyProfile({
        publisherStyles: 'hybrid',
        rules: [{ lineHeight: Number.NaN, target: { kind: 'language', value: 'ur' } }],
      })
    ).toThrow(TypeError);

    const input = {
      colors: { background: '#f5f0e8', link: '#005a8d', text: '#3d2b1f' },
      defaultFontFamilies: ['Lateef'],
      publisherStyles: 'hybrid' as const,
      rules: [{ direction: 'rtl' as const, target: { kind: 'language' as const, value: 'UR' } }],
    };
    const result = normalizeTypographyProfile(input);
    input.colors.text = '#ffffff';
    input.defaultFontFamilies[0] = 'Changed';
    input.rules[0]!.direction = 'ltr';
    expect(result).toEqual({
      colors: { background: '#F5F0E8', link: '#005A8D', text: '#3D2B1F' },
      defaultFontFamilies: ['Lateef'],
      publisherStyles: 'hybrid',
      rules: [{ direction: 'rtl', target: { kind: 'language', value: 'ur' } }],
    });
  });

  it('never compiles user input as a raw selector or style body', () => {
    const profile: ResolvedTypographyProfile = {
      colors: { background: '#F5F0E8', link: '#005A8D', text: '#3D2B1F' },
      defaultFontFamilies: ['Family "quoted"', 'serif'],
      publisherStyles: 'override',
      rules: [{ direction: 'rtl', target: { kind: 'class', value: 'safe-token' } }],
    };
    const css = typographyProfileStylesheet(profile);
    expect(css).toContain('"Family \\"quoted\\"", serif');
    expect(css).toContain(':root, body, body * { font-family:');
    expect(css).toContain('.safe-token');
    expect(css).toContain('background-color: #F5F0E8');
    expect(css).not.toContain('<script');
  });
});
