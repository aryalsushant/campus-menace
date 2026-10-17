import { describe, expect, it } from 'vitest';
import { suggestEmail } from '../src/ui/emailTypos';

describe('suggestEmail', () => {
  it('fixes common domain typos', () => {
    expect(suggestEmail('sam@gmial.com')).toBe('sam@gmail.com');
    expect(suggestEmail('sam@gmail.con')).toBe('sam@gmail.com');
    expect(suggestEmail('sam@yaho.com')).toBe('sam@yahoo.com');
    expect(suggestEmail('sam@hotmial.com')).toBe('sam@hotmail.com');
    expect(suggestEmail(' Sam@Outlok.com ')).toBe('sam@outlook.com');
  });
  it('leaves real addresses alone', () => {
    expect(suggestEmail('sam@gmail.com')).toBe(null);
    expect(suggestEmail('sam@usm.edu')).toBe(null);
    expect(suggestEmail('sam@company.io')).toBe(null);
    expect(suggestEmail('sam@mail.com')).toBe(null);
    expect(suggestEmail('not an email')).toBe(null);
  });
});
