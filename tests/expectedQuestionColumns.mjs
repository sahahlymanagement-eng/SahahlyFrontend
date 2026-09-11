import assert from 'node:assert/strict';
import { rowsFromColumns, expectedRowsError } from '../drpeter-indexing/src/components/expectedQuestionColumns.js';

assert.deepEqual(rowsFromColumns('1a\n1b\n2a\n3a', '1\n3\n2\n2'), [
  { label: '1a', marks: '1' }, { label: '1b', marks: '3' },
  { label: '2a', marks: '2' }, { label: '3a', marks: '2' },
]);
assert.deepEqual(rowsFromColumns('1a\r\n1b\r\n', '0\r\n2.5\r\n'), [
  { label: '1a', marks: '0' }, { label: '1b', marks: '2.5' }, { label: '', marks: '' },
]);
assert.equal(expectedRowsError(rowsFromColumns('1a\n1b\n2a', '1\n\n2')), '');
assert.equal(rowsFromColumns('1a\n1b\n2a', '1\n\n2')[1].marks, '');
assert.match(expectedRowsError(rowsFromColumns('1a\n\n2a', '1\n3\n2')), /Line 2/);
assert.match(expectedRowsError(rowsFromColumns('1a', '1\n3')), /Line 2/);
for (const marks of ['-1', 'two', 'Infinity']) {
  assert.match(expectedRowsError(rowsFromColumns('1a', marks)), /non-negative number/);
}
assert.equal(expectedRowsError(rowsFromColumns('', '')), '');
console.log('Question/mark pairing, blank lines, Windows line endings and validation passed.');
