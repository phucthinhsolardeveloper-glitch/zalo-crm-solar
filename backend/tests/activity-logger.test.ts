import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: { activityLog: { create: vi.fn() } },
}));

import { computeDiff } from '../src/modules/activity/activity-logger.js';

describe('computeDiff', () => {
  it('does not report equal Date values as changed', () => {
    const before = { birthDate: new Date('1990-01-01T00:00:00.000Z') };
    const after = { birthDate: new Date('1990-01-01T00:00:00.000Z') };

    expect(computeDiff(before, after, ['birthDate'])).toEqual({});
  });

  it('reports Date values with different timestamps', () => {
    const before = { birthDate: new Date('1990-01-01T00:00:00.000Z') };
    const after = { birthDate: new Date('1991-01-01T00:00:00.000Z') };

    expect(computeDiff(before, after, ['birthDate'])).toEqual({
      birthDate: { old: before.birthDate, new: after.birthDate },
    });
  });
});
