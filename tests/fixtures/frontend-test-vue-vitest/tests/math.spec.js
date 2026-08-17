import { add } from '../src/math.js';

describe('math', () => {
  it('[TC-03] 两数相加', () => {
    expect(add(1, 2)).toBe(3);
  });
});
