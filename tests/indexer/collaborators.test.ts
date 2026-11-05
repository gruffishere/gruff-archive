import { describe, expect, it } from 'vitest';
import { parseCollaborators } from '../../indexer/collaborators';

describe('parseCollaborators', () => {
  it('parses the real descriptions', () => {
    expect(parseCollaborators('FUTURE DREAMS collab w/ SuperVillian\nmore text')).toEqual(['SuperVillian']);
    expect(parseCollaborators('THEY MEME collab w/ DeltaSauce\nx')).toEqual(['DeltaSauce']);
    expect(parseCollaborators('Mass Adoption collab w/ BrutalEth\nx')).toEqual(['BrutalEth']);
  });
  it('accepts "collab with" and "collaboration with", case-insensitively', () => {
    expect(parseCollaborators('Piece COLLAB WITH Ann')).toEqual(['Ann']);
    expect(parseCollaborators('A collaboration with Bob.')).toEqual(['Bob']);
  });
  it('splits on comma, &, and, x; trims and dedupes', () => {
    expect(parseCollaborators('collab w/ A, B & C and D x E, a, A ,')).toEqual(['A', 'B', 'C', 'D', 'E', 'a']);
  });
  it('stops at the first period or semicolon', () => {
    expect(parseCollaborators('collab w/ A; second thing')).toEqual(['A']);
    expect(parseCollaborators('collab w/ A & B. Minted 2024')).toEqual(['A', 'B']);
  });
  it('returns [] without collab or with no description', () => {
    expect(parseCollaborators('just a picture')).toEqual([]);
    expect(parseCollaborators(null)).toEqual([]);
    expect(parseCollaborators('collab w/ ')).toEqual([]);
  });
  it('does not match "without" or "within", strips @, handles CRLF', () => {
    expect(parseCollaborators('collab without Bob')).toEqual([]);
    expect(parseCollaborators('collab within Bob')).toEqual([]);
    expect(parseCollaborators('collab w/ @Ann, @Bob\r\nnext')).toEqual(['Ann', 'Bob']);
    expect(parseCollaborators('x collab w/@Ann\r\nnext')).toEqual(['Ann']);
  });
});
