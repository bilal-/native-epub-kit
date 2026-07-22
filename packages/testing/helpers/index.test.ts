import { describe, expect, it } from 'vitest';

import { defineContractFixture } from './index';

describe('defineContractFixture', () => {
  it('normalizes a fixture name and freezes the descriptor', () => {
    const fixture = defineContractFixture(' locator/basic ', { href: 'chapter.xhtml' });

    expect(fixture).toEqual({
      name: 'locator/basic',
      value: { href: 'chapter.xhtml' },
    });
    expect(Object.isFrozen(fixture)).toBe(true);
  });

  it('rejects an empty fixture name', () => {
    expect(() => defineContractFixture('   ', {})).toThrow(TypeError);
  });
});
