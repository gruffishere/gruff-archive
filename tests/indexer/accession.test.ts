import { describe, expect, it } from 'vitest';
import { accession } from '../../indexer/accession';

describe('accession', () => {
  it('formats a collection-level number', () => {
    expect(accession('SLV', 2023)).toBe('GRF.23.SLV');
  });
  it('pads token ids to at least 3 digits', () => {
    expect(accession('SLV', 2023, '2', '3')).toBe('GRF.23.SLV.002');
  });
  it('pads to the width of the largest id', () => {
    expect(accession('FCT', 2026, '7', '2222')).toBe('GRF.26.FCT.0007');
  });
});

describe('accession with a configured width (M7)', () => {
  it('uses the configured width instead of max(3, digits)', () => {
    expect(accession('FCT', 25, '7', '2222', 5)).toBe('GRF.25.FCT.00007');
    expect(accession('FCT', 25, '7', '12', 2)).toBe('GRF.25.FCT.07');
  });
});
