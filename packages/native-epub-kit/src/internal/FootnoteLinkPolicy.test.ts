import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { FootnotePolicy, ReaderLinkPolicy } from '../records.ts';
import {
  MAXIMUM_EXTERNAL_LINK_SCHEMES,
  MAXIMUM_FOOTNOTE_HEURISTIC_RULES,
  decideExternalLink,
  decideInternalFootnote,
  normalizeFootnotePolicy,
  normalizeReaderLinkPolicy,
} from './FootnoteLinkPolicy.ts';

interface FootnoteCase {
  expectedDecision?: Record<string, unknown>;
  expectedError?: boolean;
  expectedPolicy?: Record<string, unknown>;
  href: string;
  name: string;
  policy: FootnotePolicy | null;
  semantic: boolean;
}

interface LinkCase {
  expectedDecision?: Record<string, unknown>;
  expectedError?: boolean;
  expectedPolicy?: Record<string, unknown>;
  href: string;
  name: string;
  policy: ReaderLinkPolicy | null;
}

interface PolicyContract {
  footnoteCases: FootnoteCase[];
  linkCases: LinkCase[];
  maximumExternalSchemes: number;
  maximumHeuristicRules: number;
  version: number;
}

const contract = JSON.parse(
  readFileSync(
    new URL('../../../testing/contracts/footnote-link-policy-v1/cases.json', import.meta.url),
    'utf8'
  )
) as PolicyContract;

describe('footnote-link-policy-v1 contract', () => {
  it('freezes version and collection bounds', () => {
    expect(contract.version).toBe(1);
    expect(MAXIMUM_FOOTNOTE_HEURISTIC_RULES).toBe(contract.maximumHeuristicRules);
    expect(MAXIMUM_EXTERNAL_LINK_SCHEMES).toBe(contract.maximumExternalSchemes);
  });

  for (const testCase of contract.footnoteCases) {
    it(`normalizes and decides ${testCase.name}`, () => {
      const action = () => {
        const policy = normalizeFootnotePolicy(testCase.policy ?? undefined);
        return {
          decision: decideInternalFootnote(policy, testCase.href, testCase.semantic),
          policy,
        };
      };
      if (testCase.expectedError) {
        expect(action).toThrow(TypeError);
      } else {
        expect(action()).toEqual({
          decision: testCase.expectedDecision,
          policy: testCase.expectedPolicy,
        });
      }
    });
  }

  for (const testCase of contract.linkCases) {
    it(`normalizes and decides ${testCase.name}`, () => {
      const action = () => {
        const policy = normalizeReaderLinkPolicy(testCase.policy ?? undefined);
        return { decision: decideExternalLink(policy, testCase.href), policy };
      };
      if (testCase.expectedError) {
        expect(action).toThrow(TypeError);
      } else {
        expect(action()).toEqual({
          decision: testCase.expectedDecision,
          policy: testCase.expectedPolicy,
        });
      }
    });
  }

  it('rejects over-limit rules and schemes', () => {
    expect(() =>
      normalizeFootnotePolicy({
        heuristicRules: Array.from(
          { length: MAXIMUM_FOOTNOTE_HEURISTIC_RULES + 1 },
          (_, index) => ({
            fragmentPrefix: `note-${index}`,
            id: `rule-${index}`,
          })
        ),
        mode: 'semantic-and-heuristic',
      })
    ).toThrow(TypeError);
    expect(() =>
      normalizeReaderLinkPolicy({
        allowedExternalSchemes: Array.from(
          { length: MAXIMUM_EXTERNAL_LINK_SCHEMES + 1 },
          (_, index) => `scheme${index}`
        ),
      })
    ).toThrow(TypeError);
  });
});
