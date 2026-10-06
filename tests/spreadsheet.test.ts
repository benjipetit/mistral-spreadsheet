import { Spreadsheet } from '../src/spreadsheet';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(e);
    process.exit(1);
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertError(actual: any, expectedError: string, message?: string) {
  if (typeof actual !== 'object' || actual === null || !('error' in actual) || actual.error !== expectedError) {
    throw new Error(`${message || 'Assertion failed'}: expected { error: "${expectedError}" }, got ${JSON.stringify(actual)}`);
  }
}

// Basic cell values
test('set and get number', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 42);
  assertEqual(sheet.getCell('A1'), 42);
});

test('set and get string', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 'hello');
  assertEqual(sheet.getCell('A1'), 'hello');
});

test('set and get boolean', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', true);
  assertEqual(sheet.getCell('A1'), true);
});

test('set and get null', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', null);
  assertEqual(sheet.getCell('A1'), null);
});

test('empty cell returns null', () => {
  const sheet = new Spreadsheet();
  assertEqual(sheet.getCell('A1'), null);
});

// Formula evaluation
test('simple arithmetic', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', '=1 + 2 * 3');
  assertEqual(sheet.getCell('A1'), 7);
});

test('parentheses', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', '=(1 + 2) * 3');
  assertEqual(sheet.getCell('A1'), 9);
});

test('division', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', '=10 / 2');
  assertEqual(sheet.getCell('A1'), 5);
});

test('division by zero', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', '=10 / 0');
  assertError(sheet.getCell('A1'), '#DIV/0!');
});

test('comparisons', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', '=1 < 2');
  assertEqual(sheet.getCell('A1'), true);
  sheet.setCell('A2', '=1 > 2');
  assertEqual(sheet.getCell('A2'), false);
  sheet.setCell('A3', '=1 = 1');
  assertEqual(sheet.getCell('A3'), true);
  sheet.setCell('A4', '=1 != 2');
  assertEqual(sheet.getCell('A4'), true);
  sheet.setCell('A5', '=1 <= 1');
  assertEqual(sheet.getCell('A5'), true);
  sheet.setCell('A6', '=1 >= 2');
  assertEqual(sheet.getCell('A6'), false);
});

// Cell references
test('cell reference', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 10);
  sheet.setCell('A2', '=A1 * 2');
  assertEqual(sheet.getCell('A2'), 20);
});

test('chained references', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 10);
  sheet.setCell('A2', '=A1 * 2');
  sheet.setCell('A3', '=A2 + 5');
  assertEqual(sheet.getCell('A3'), 25);
});

test('circular reference', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', '=B1 + 1');
  sheet.setCell('B1', '=C1 + 1');
  sheet.setCell('C1', '=A1 + 1');
  assertError(sheet.getCell('A1'), '#CYCLE!');
  assertError(sheet.getCell('B1'), '#CYCLE!');
  assertError(sheet.getCell('C1'), '#CYCLE!');
});

test('break circular reference', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', '=B1 + 1');
  sheet.setCell('B1', '=C1 + 1');
  sheet.setCell('C1', '=A1 + 1');
  sheet.setCell('C1', 5);
  assertEqual(sheet.getCell('A1'), 7);
  assertEqual(sheet.getCell('B1'), 6);
  assertEqual(sheet.getCell('C1'), 5);
});

// Functions
test('SUM function', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 1);
  sheet.setCell('A2', 2);
  sheet.setCell('A3', 3);
  sheet.setCell('A4', '=SUM(A1:A3)');
  assertEqual(sheet.getCell('A4'), 6);
});

test('SUM with numbers', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', '=SUM(1, 2, 3)');
  assertEqual(sheet.getCell('A1'), 6);
});

test('MIN function', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 1);
  sheet.setCell('A2', 2);
  sheet.setCell('A3', 3);
  sheet.setCell('A4', '=MIN(A1:A3)');
  assertEqual(sheet.getCell('A4'), 1);
});

test('MAX function', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 1);
  sheet.setCell('A2', 2);
  sheet.setCell('A3', 3);
  sheet.setCell('A4', '=MAX(A1:A3)');
  assertEqual(sheet.getCell('A4'), 3);
});

test('IF function - true branch', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 1);
  sheet.setCell('B1', '=1 / 0');
  sheet.setCell('C1', '=IF(A1 = 1, 42, B1)');
  assertEqual(sheet.getCell('C1'), 42);
});

test('IF function - false branch', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 2);
  sheet.setCell('B1', '=1 / 0');
  sheet.setCell('C1', '=IF(A1 = 1, 42, B1)');
  assertError(sheet.getCell('C1'), '#DIV/0!');
});

test('IF function - condition changes', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 1);
  sheet.setCell('B1', '=1 / 0');
  sheet.setCell('C1', '=IF(A1 = 1, 42, B1)');
  assertEqual(sheet.getCell('C1'), 42);
  sheet.setCell('A1', 2);
  assertError(sheet.getCell('C1'), '#DIV/0!');
});

// Reactivity
test('reactivity - basic', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 1);
  sheet.setCell('A2', '=A1 + 1');
  sheet.setCell('A3', '=A2 + 1');
  sheet.setCell('Z1', '=100 + 200');
  
  sheet.resetStats();
  sheet.setCell('A1', 10);
  
  const stats = sheet.getStats();
  assertEqual(stats.evaluatedCells.includes('A1'), true);
  assertEqual(stats.evaluatedCells.includes('A2'), true);
  assertEqual(stats.evaluatedCells.includes('A3'), true);
  assertEqual(stats.evaluatedCells.includes('Z1'), false);
});

test('reactivity - dependency change', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 1);
  sheet.setCell('B1', 10);
  sheet.setCell('C1', '=A1');
  
  sheet.setCell('C1', '=B1');
  
  sheet.resetStats();
  sheet.setCell('A1', 2);
  
  const stats = sheet.getStats();
  assertEqual(stats.evaluatedCells.includes('C1'), false);
  
  sheet.resetStats();
  sheet.setCell('B1', 20);
  
  const stats2 = sheet.getStats();
  assertEqual(stats2.evaluatedCells.includes('C1'), true);
});

// Error handling
test('malformed formula', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', '=1 + ');
  assertError(sheet.getCell('A1'), '#VALUE!');
});

test('invalid reference', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', '=B1 + C1');
  assertEqual(sheet.getCell('A1'), 0);
});

test('string in arithmetic', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 'hello');
  sheet.setCell('A2', '=A1 + 1');
  assertError(sheet.getCell('A2'), '#VALUE!');
});

test('boolean in arithmetic', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', true);
  sheet.setCell('A2', '=A1 + 1');
  assertError(sheet.getCell('A2'), '#VALUE!');
});

// Null handling
test('null in arithmetic', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', null);
  sheet.setCell('A2', '=A1 + 1');
  assertEqual(sheet.getCell('A2'), 1);
});

test('empty cell in arithmetic', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A2', '=A1 + 1');
  assertEqual(sheet.getCell('A2'), 1);
});

// Case insensitivity
test('case insensitive addresses', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('a1', 42);
  assertEqual(sheet.getCell('A1'), 42);
  sheet.setCell('b1', '=a1 * 2');
  assertEqual(sheet.getCell('B1'), 84);
});

// Ranges
test('range in SUM', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 1);
  sheet.setCell('A2', 2);
  sheet.setCell('A3', 3);
  sheet.setCell('B1', '=SUM(A1:A3)');
  assertEqual(sheet.getCell('B1'), 6);
});

test('range in MIN', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 1);
  sheet.setCell('A2', 2);
  sheet.setCell('A3', 3);
  sheet.setCell('B1', '=MIN(A1:A3)');
  assertEqual(sheet.getCell('B1'), 1);
});

test('range in MAX', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 1);
  sheet.setCell('A2', 2);
  sheet.setCell('A3', 3);
  sheet.setCell('B1', '=MAX(A1:A3)');
  assertEqual(sheet.getCell('B1'), 3);
});

test('2D range', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 1);
  sheet.setCell('A2', 2);
  sheet.setCell('B1', 3);
  sheet.setCell('B2', 4);
  sheet.setCell('C1', '=SUM(A1:B2)');
  assertEqual(sheet.getCell('C1'), 10);
});

// Whitespace
test('whitespace in formula', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', '= 1 + 2 * 3 ');
  assertEqual(sheet.getCell('A1'), 7);
});

// No recomputation on same value
test('no recomputation on same value', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 1);
  sheet.setCell('A2', '=A1 + 1');
  
  sheet.resetStats();
  sheet.setCell('A1', 1);
  
  const stats = sheet.getStats();
  assertEqual(stats.evaluatedCells.length, 0);
});

// Deterministic evaluation order
test('deterministic evaluation order', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 1);
  sheet.setCell('A2', '=A1 + 1');
  sheet.setCell('A3', '=A2 + 1');
  
  sheet.resetStats();
  sheet.setCell('A1', 10);
  
  const stats = sheet.getStats();
  const a1Index = stats.evaluatedCells.indexOf('A1');
  const a2Index = stats.evaluatedCells.indexOf('A2');
  const a3Index = stats.evaluatedCells.indexOf('A3');
  
  assertEqual(a1Index < a2Index, true);
  assertEqual(a2Index < a3Index, true);
});

// Forward references
test('forward references', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A2', '=A1 + 1');
  sheet.setCell('A1', 1);
  assertEqual(sheet.getCell('A2'), 2);
});

// Cell references inside strings should not create dependencies
test('string with cell reference', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', '=A2');
  sheet.setCell('B1', 'A1');
  sheet.setCell('A2', 10);
  assertEqual(sheet.getCell('A1'), 10);
  assertEqual(sheet.getCell('B1'), 'A1');
});

// Error propagation
test('error propagation', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', '=1 / 0');
  sheet.setCell('A2', '=A1 + 1');
  assertError(sheet.getCell('A2'), '#DIV/0!');
});

// Multiple operations
test('complex formula', () => {
  const sheet = new Spreadsheet();
  sheet.setCell('A1', 10);
  sheet.setCell('A2', 20);
  sheet.setCell('A3', '=(A1 + A2) * 2 / 5');
  assertEqual(sheet.getCell('A3'), 12);
});

console.log('All tests passed!');
