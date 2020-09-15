import { isOlderVS } from './versionstamp';

test('compareVS(older, newer) === true, 1', () => {
  const older = 'AAAAOO4jk5UAAA==';
  const newer = 'AAAAOTKy5nUAAA==';
  expect(isOlderVS(older, newer)).toBeTruthy();
  expect(isOlderVS(newer, older)).toBeFalsy();
});

test('compareVS(older, newer) === true, 2', () => {
  const older = 'AAAAOTKy5nUAAA==';
  const newer = 'AAAAOW+nMK8AAA==';
  expect(isOlderVS(older, newer)).toBeTruthy();
  expect(isOlderVS(newer, older)).toBeFalsy();
});
