import { describe, expect, it } from 'vitest';
import type { CoachExchange } from '../state/types';
import { recap } from './recap';

const exchange = (over: Partial<CoachExchange> = {}): CoachExchange => ({
  at: 1000,
  technique: 'naked_single',
  level: 1,
  findingKey: 'naked_single:2',
  offered: false,
  ...over,
});

describe('recap', () => {
  it('reports nothing for a game the player never asked about', () => {
    expect(recap([])).toEqual({ findings: 0, deepest: 0, named: [] });
  });

  it('counts one finding once, however deep the player went on it', () => {
    const log = [
      exchange({ level: 1 }),
      exchange({ level: 2 }),
      exchange({ level: 3 }),
      exchange({ level: 4 }),
    ];

    expect(recap(log).findings).toBe(1);
    expect(recap(log).deepest).toBe(4);
  });

  it('counts distinct findings separately, even for the same technique', () => {
    const log = [
      exchange({ findingKey: 'naked_single:2' }),
      exchange({ findingKey: 'naked_single:40' }),
    ];

    expect(recap(log).findings).toBe(2);
  });

  it('names only what reached level 2 — level 1 named nothing', () => {
    const log = [
      exchange({ technique: 'pointing', findingKey: 'pointing:1', level: 1 }),
      exchange({ technique: 'hidden_pair', findingKey: 'hidden_pair:9', level: 2 }),
    ];

    expect(recap(log).named).toEqual(['hidden_pair']);
  });

  it('lists each technique once, in the order it was first named', () => {
    const log = [
      exchange({ technique: 'hidden_pair', findingKey: 'a', level: 3 }),
      exchange({ technique: 'pointing', findingKey: 'b', level: 2 }),
      exchange({ technique: 'hidden_pair', findingKey: 'c', level: 4 }),
    ];

    expect(recap(log).named).toEqual(['hidden_pair', 'pointing']);
  });
});
