import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { fixtureAsJsonValue, loadContractFixtures, readJsonPointer } from './loader';

const casesDirectory = fileURLToPath(new URL('./qualification-v0/cases/', import.meta.url));

describe('shared contract fixtures', () => {
  it('loads and round-trips every qualification case', async () => {
    const fixtures = await loadContractFixtures(casesDirectory);

    expect(fixtures).toHaveLength(4);
    expect(new Set(fixtures.map((fixture) => fixture.caseId)).size).toBe(fixtures.length);

    for (const fixture of fixtures) {
      expect(JSON.parse(JSON.stringify(fixture))).toEqual(fixture);
      const root = fixtureAsJsonValue(fixture);

      for (const pointer of fixture.expectations.requiredJsonPointers) {
        expect(readJsonPointer(root, pointer), `${fixture.caseId}: ${pointer}`).toMatchObject({
          found: true,
        });
      }
      for (const pointer of fixture.expectations.explicitNullJsonPointers) {
        expect(readJsonPointer(root, pointer), `${fixture.caseId}: ${pointer}`).toEqual({
          found: true,
          value: null,
        });
      }
    }
  });
});
