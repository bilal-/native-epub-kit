import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type {
  HorizontalNavigationAction,
  LogicalNavigationDirection,
  NavigationPolicyDecision,
  NavigationPolicyDecisionInput,
  ReaderNavigationPolicy,
  ReaderNavigationPolicyStatus,
} from '../records';
import {
  DEFAULT_READER_NAVIGATION_POLICY,
  logicalDirectionForHorizontalAction,
  normalizeReaderNavigationPolicy,
  parseReaderNavigationPolicyStatus,
  readerNavigationPolicyDecision,
  readerNavigationPolicySupport,
} from './ReaderNavigationPolicy';

interface NavigationPolicyContract {
  decisionCases: {
    expected: NavigationPolicyDecision;
    input: NavigationPolicyDecisionInput;
    name: string;
    policy: ReaderNavigationPolicy;
  }[];
  horizontalDirectionCases: {
    action: HorizontalNavigationAction;
    expected: LogicalNavigationDirection;
    progression: 'ltr' | 'rtl';
  }[];
  version: 1;
}

const contract = JSON.parse(
  readFileSync(
    new URL('../../../testing/contracts/navigation-policy-v1/cases.json', import.meta.url),
    'utf8'
  )
) as NavigationPolicyContract;

const status = (overrides: Partial<ReaderNavigationPolicyStatus> = {}) => ({
  application: 'initial' as const,
  applied: { ...DEFAULT_READER_NAVIGATION_POLICY },
  boundaryGranularity: 'reading-order-resource' as const,
  boundaryPrecision: 'resource' as const,
  effectiveLayout: 'scrolled' as const,
  generation: 2,
  instanceId: 'navigation-policy',
  readingProgression: 'ltr' as const,
  requested: { ...DEFAULT_READER_NAVIGATION_POLICY },
  support: readerNavigationPolicySupport(),
  warnings: ['chapter-boundaries-use-reading-order-resources'],
  ...overrides,
});

describe('navigation-policy-v1 contract', () => {
  it('pins every decision and logical horizontal direction', () => {
    expect(contract.version).toBe(1);
    expect(contract.decisionCases).toHaveLength(10);
    for (const testCase of contract.decisionCases) {
      expect(
        readerNavigationPolicyDecision(testCase.policy, testCase.input),
        testCase.name
      ).toEqual(testCase.expected);
    }
    for (const testCase of contract.horizontalDirectionCases) {
      expect(logicalDirectionForHorizontalAction(testCase.action, testCase.progression)).toBe(
        testCase.expected
      );
    }
  });
});

describe('reader navigation policy validation and status', () => {
  it('normalizes stable conservative defaults and explicit values', () => {
    expect(normalizeReaderNavigationPolicy()).toEqual(DEFAULT_READER_NAVIGATION_POLICY);
    expect(
      normalizeReaderNavigationPolicy({
        animatedTransitions: true,
        chapterTurnGesture: 'enabled',
        edgeTapNavigation: true,
        hardwareKeyNavigation: false,
        inputSuppressed: true,
        pageTurnGesture: 'disabled',
      })
    ).toEqual({
      animatedTransitions: true,
      chapterTurnGesture: 'enabled',
      edgeTapNavigation: true,
      hardwareKeyNavigation: false,
      inputSuppressed: true,
      pageTurnGesture: 'disabled',
    });
  });

  it('rejects unknown, mistyped, and unsupported values', () => {
    expect(() => normalizeReaderNavigationPolicy([] as never)).toThrow(TypeError);
    expect(() =>
      normalizeReaderNavigationPolicy({ unknown: true } as ReaderNavigationPolicy)
    ).toThrow(TypeError);
    expect(() =>
      normalizeReaderNavigationPolicy({ pageTurnGesture: 'sometimes' } as never)
    ).toThrow(TypeError);
    expect(() => normalizeReaderNavigationPolicy({ edgeTapNavigation: 'yes' } as never)).toThrow(
      TypeError
    );
  });

  it('parses complete ordered native status and detaches arrays', () => {
    const input = status({ application: 'navigator-recreation', readingProgression: 'rtl' });
    const parsed = parseReaderNavigationPolicyStatus(input);
    input.warnings.push('mutated');
    expect(parsed).toMatchObject({
      application: 'navigator-recreation',
      boundaryGranularity: 'reading-order-resource',
      boundaryPrecision: 'resource',
      readingProgression: 'rtl',
    });
    expect(parsed.warnings).toEqual(['chapter-boundaries-use-reading-order-resources']);
    expect(parsed.support.at(1)).toEqual({
      application: 'navigator-recreation',
      name: 'chapterTurnGesture',
      supported: true,
    });
  });

  it('rejects mismatched applied policy and malformed support', () => {
    expect(() =>
      parseReaderNavigationPolicyStatus(
        status({ applied: { ...DEFAULT_READER_NAVIGATION_POLICY, edgeTapNavigation: true } })
      )
    ).toThrow(TypeError);
    expect(() => parseReaderNavigationPolicyStatus(status({ support: [] }))).toThrow(TypeError);
    expect(() =>
      parseReaderNavigationPolicyStatus(status({ boundaryPrecision: 'exact' as never }))
    ).toThrow(TypeError);
  });
});
