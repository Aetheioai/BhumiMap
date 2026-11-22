import assert from 'node:assert/strict';
import test from 'node:test';
import { solveQuadrilateral } from '../geometry';
import {
  convertAreaFromSqFt,
  FEET_PER_HAAT,
  FEET_PER_LINK,
  fromFeet,
  SQFT_PER_ACRE,
  SQFT_PER_BIGHA,
  SQFT_PER_KATHA,
  SQFT_PER_SHOTOK,
  toFeet,
} from '../units';

test('solves exact rectangle and matches statutory Bangladeshi units', () => {
  // 60 ft x 48 ft = 2,880 sq ft = exact 4.0 Katha = 0.2 Bigha
  const diag = Math.hypot(60, 48);
  const res = solveQuadrilateral(60, 48, 60, 48, diag, 'AC', 'convex');

  assert.equal(res.valid, true);
  assert.ok(Math.abs(res.areaSqFt - 2880) < 1e-6);
  assert.ok(Math.abs(res.otherDiagonalFt - diag) < 1e-6);
  assert.ok(res.anglesDeg);
  assert.ok(Math.abs(res.anglesDeg.A - 90) < 1e-6);
  assert.ok(Math.abs(res.anglesDeg.B - 90) < 1e-6);
  assert.ok(Math.abs(res.anglesDeg.C - 90) < 1e-6);
  assert.ok(Math.abs(res.anglesDeg.D - 90) < 1e-6);

  const area = convertAreaFromSqFt(res.areaSqFt);
  assert.ok(Math.abs(area.katha - 4) < 1e-6);
  assert.ok(Math.abs(area.bigha - 0.2) < 1e-6);
  assert.ok(Math.abs(area.shotok - 2880 / SQFT_PER_SHOTOK) < 1e-6);
});

test('AC and derived BD reconstructions yield identical irregular plot area', () => {
  const fromAC = solveQuadrilateral(98, 74.5, 112, 62, 121, 'AC', 'convex');
  assert.equal(fromAC.valid, true);

  const fromBD = solveQuadrilateral(98, 74.5, 112, 62, fromAC.otherDiagonalFt, 'BD', 'convex');
  assert.equal(fromBD.valid, true);
  assert.ok(Math.abs(fromAC.areaSqFt - fromBD.areaSqFt) < 1e-6);

  const sumDeg =
    fromAC.anglesDeg!.A + fromAC.anglesDeg!.B + fromAC.anglesDeg!.C + fromAC.anglesDeg!.D;
  assert.ok(Math.abs(sumDeg - 360) < 1e-6);
});

test('handles concave dart quadrilateral with exact reflex interior angle', () => {
  const dart = solveQuadrilateral(100, 60, 60, 100, 90, 'BD', 'concave');
  assert.equal(dart.valid, true);
  assert.ok(dart.triangle1 && dart.triangle2 && dart.anglesDeg);

  const expectedArea = Math.abs(dart.triangle1.areaSqFt - dart.triangle2.areaSqFt);
  assert.ok(Math.abs(dart.areaSqFt - expectedArea) < 1e-6);
  assert.ok(dart.anglesDeg.C > 180, 'expected reflex angle at vertex C');

  const sumDeg = dart.anglesDeg.A + dart.anglesDeg.B + dart.anglesDeg.C + dart.anglesDeg.D;
  assert.ok(Math.abs(sumDeg - 360) < 1e-6);
});

test('rejects invalid diagonals with exact valid bounds', () => {
  const tooLong = solveQuadrilateral(60, 50, 60, 50, 120, 'AC', 'convex');
  assert.equal(tooLong.valid, false);
  assert.equal(tooLong.errorCode, 'DIAGONAL_TOO_LONG');
  assert.deepEqual(tooLong.validDiagonalRange, { min: 10, max: 110 });

  const tooShort = solveQuadrilateral(60, 50, 60, 50, 8, 'AC', 'convex');
  assert.equal(tooShort.valid, false);
  assert.equal(tooShort.errorCode, 'DIAGONAL_TOO_SHORT');
  assert.deepEqual(tooShort.validDiagonalRange, { min: 10, max: 110 });
});

test('statutory area and length conversions are exact', () => {
  assert.equal(convertAreaFromSqFt(SQFT_PER_SHOTOK).shotok, 1);
  assert.equal(convertAreaFromSqFt(SQFT_PER_KATHA).katha, 1);
  assert.equal(convertAreaFromSqFt(SQFT_PER_BIGHA).bigha, 1);
  assert.equal(convertAreaFromSqFt(SQFT_PER_ACRE).acre, 1);
  assert.equal(convertAreaFromSqFt(SQFT_PER_ACRE).shotok, 100);

  assert.ok(Math.abs(toFeet(10, 'ft-in', 6) - 10.5) < 1e-9);
  assert.deepEqual(fromFeet(10.5, 'ft-in'), { main: 10, inches: 6 });
  assert.ok(Math.abs(toFeet(100, 'link') - 100 * FEET_PER_LINK) < 1e-9);
  assert.ok(Math.abs(toFeet(10, 'haat') - 10 * FEET_PER_HAAT) < 1e-9);
});
