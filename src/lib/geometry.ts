export type DiagonalType = 'AC' | 'BD';
export type ShapeMode = 'convex' | 'concave';
export type EdgeKey = 'ab' | 'bc' | 'cd' | 'da' | 'diagonal';

export interface Point2D {
  x: number;
  y: number;
}

export interface TriangleBreakdown {
  label: string;
  vertices: [string, string, string];
  sides: [number, number, number];
  semiPerimeter: number;
  areaSqFt: number;
  centroid: Point2D;
}

export interface QuadGeometryResult {
  valid: boolean;
  errorCode?:
    | 'MISSING_INPUT'
    | 'SIDES_CANNOT_CLOSE'
    | 'DIAGONAL_TOO_SHORT'
    | 'DIAGONAL_TOO_LONG'
    | 'SELF_INTERSECTING';
  failingTriangle?: string;
  validDiagonalRange?: { min: number; max: number };
  // All geometric outputs below are present when valid === true
  vertices?: {
    A: Point2D;
    B: Point2D;
    C: Point2D;
    D: Point2D;
  };
  anglesDeg?: {
    A: number;
    B: number;
    C: number;
    D: number;
  };
  areaSqFt: number;
  perimeterFt: number;
  otherDiagonalFt: number;
  averageMethodSqFt: number;
  averageOverestimatePct: number;
  triangle1?: TriangleBreakdown;
  triangle2?: TriangleBreakdown;
  canBeConcave: boolean;
}

function heronArea(s1: number, s2: number, s3: number): number {
  const s = (s1 + s2 + s3) / 2;
  const prod = s * (s - s1) * (s - s2) * (s - s3);
  return prod > 0 ? Math.sqrt(prod) : 0;
}

function dist(p: Point2D, q: Point2D): number {
  return Math.hypot(p.x - q.x, p.y - q.y);
}

function cross(o: Point2D, a: Point2D, b: Point2D): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function segmentsProperlyIntersect(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): boolean {
  const eps = 1e-7;
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);

  if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))) {
    return true;
  }
  return false;
}

function polygonSignedArea(pts: Point2D[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

function computeInteriorAngles(A: Point2D, B: Point2D, C: Point2D, D: Point2D): {
  A: number;
  B: number;
  C: number;
  D: number;
} {
  // Vertices A -> B -> C -> D. Determine orientation via signed area.
  // If signedArea < 0, polygon is clockwise in +y-up coordinates; if > 0, counter-clockwise.
  const pts = [A, B, C, D];
  const signed = polygonSignedArea(pts);
  const isClockwise = signed < 0;

  const angleAt = (idx: number): number => {
    const prev = pts[(idx + 3) % 4];
    const curr = pts[idx];
    const next = pts[(idx + 1) % 4];
    const v1 = { x: prev.x - curr.x, y: prev.y - curr.y };
    const v2 = { x: next.x - curr.x, y: next.y - curr.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const crs = v1.x * v2.y - v1.y * v2.x;
    // Signed angle from v1 (to prev) to v2 (to next) in (-pi, pi]
    const theta = Math.atan2(crs, dot);
    // In +y-up coordinates, for clockwise traversal (signedArea < 0), rotating CCW from
    // v1 (prev) to v2 (next) sweeps across the interior of the polygon.
    let interior = isClockwise ? theta : -theta;
    if (interior <= 0) interior += Math.PI * 2;
    return (interior * 180) / Math.PI;
  };

  return {
    A: angleAt(0),
    B: angleAt(1),
    C: angleAt(2),
    D: angleAt(3),
  };
}

function rotatePoint(p: Point2D, cosA: number, sinA: number): Point2D {
  return {
    x: p.x * cosA - p.y * sinA,
    y: p.x * sinA + p.y * cosA,
  };
}

function orientSouthHorizontal(
  rawA: Point2D,
  rawB: Point2D,
  rawC: Point2D,
  rawD: Point2D
): { A: Point2D; B: Point2D; C: Point2D; D: Point2D } {
  // Align vector D -> C along +x so South edge CD is horizontal at the bottom
  const vx = rawC.x - rawD.x;
  const vy = rawC.y - rawD.y;
  const angle = Math.atan2(vy, vx);
  const cosA = Math.cos(-angle);
  const sinA = Math.sin(-angle);

  let A = rotatePoint(rawA, cosA, sinA);
  let B = rotatePoint(rawB, cosA, sinA);
  let C = rotatePoint(rawC, cosA, sinA);
  let D = rotatePoint(rawD, cosA, sinA);

  // If the polygon centroid is below CD (rare concave inversion), flip y? No — keep geometric orientation
  // consistent: D is bottom-left, C is bottom-right, and positive signed area of (D,C,A) means A is above CD.
  // Center around centroid for clean rotation/viewport framing
  const cx = (A.x + B.x + C.x + D.x) / 4;
  const cy = (A.y + B.y + C.y + D.y) / 4;

  A = { x: A.x - cx, y: A.y - cy };
  B = { x: B.x - cx, y: B.y - cy };
  C = { x: C.x - cx, y: C.y - cy };
  D = { x: D.x - cx, y: D.y - cy };

  return { A, B, C, D };
}

function buildVertices(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  diagonalType: DiagonalType,
  shapeMode: ShapeMode
): { A: Point2D; B: Point2D; C: Point2D; D: Point2D; selfIntersecting: boolean } {
  let rawA: Point2D;
  let rawB: Point2D;
  let rawC: Point2D;
  let rawD: Point2D;

  if (diagonalType === 'AC') {
    rawA = { x: 0, y: 0 };
    rawC = { x: e, y: 0 };

    const xB = (a * a + e * e - b * b) / (2 * e);
    const yB = Math.sqrt(Math.max(0, a * a - xB * xB));
    rawB = { x: xB, y: yB };

    const xD = (d * d + e * e - c * c) / (2 * e);
    const yDMag = Math.sqrt(Math.max(0, d * d - xD * xD));
    rawD = { x: xD, y: shapeMode === 'convex' ? -yDMag : yDMag };
  } else {
    // Diagonal BD
    rawD = { x: 0, y: 0 };
    rawB = { x: e, y: 0 };

    const xA = (d * d + e * e - a * a) / (2 * e);
    const yA = Math.sqrt(Math.max(0, d * d - xA * xA));
    rawA = { x: xA, y: yA };

    const xC = (c * c + e * e - b * b) / (2 * e);
    const yCMag = Math.sqrt(Math.max(0, c * c - xC * xC));
    rawC = { x: xC, y: shapeMode === 'convex' ? -yCMag : yCMag };
  }

  const selfIntersecting =
    segmentsProperlyIntersect(rawA, rawB, rawC, rawD) ||
    segmentsProperlyIntersect(rawB, rawC, rawD, rawA);

  const oriented = orientSouthHorizontal(rawA, rawB, rawC, rawD);
  return { ...oriented, selfIntersecting };
}

export function solveQuadrilateral(
  ab: number,
  bc: number,
  cd: number,
  da: number,
  diagonal: number,
  diagonalType: DiagonalType,
  shapeMode: ShapeMode = 'convex'
): QuadGeometryResult {
  const eps = 1e-6;
  const perimeterFt = Math.max(0, ab) + Math.max(0, bc) + Math.max(0, cd) + Math.max(0, da);
  const averageMethodSqFt = ((ab + cd) / 2) * ((bc + da) / 2);

  if (
    !Number.isFinite(ab) ||
    !Number.isFinite(bc) ||
    !Number.isFinite(cd) ||
    !Number.isFinite(da) ||
    !Number.isFinite(diagonal) ||
    ab <= eps ||
    bc <= eps ||
    cd <= eps ||
    da <= eps ||
    diagonal <= eps
  ) {
    return {
      valid: false,
      errorCode: 'MISSING_INPUT',
      areaSqFt: 0,
      perimeterFt,
      otherDiagonalFt: 0,
      averageMethodSqFt: 0,
      averageOverestimatePct: 0,
      canBeConcave: false,
    };
  }

  // Compute exact mathematically valid range for the chosen diagonal
  let minDiag: number;
  let maxDiag: number;
  let tri1Name: string;
  let tri2Name: string;

  if (diagonalType === 'AC') {
    minDiag = Math.max(Math.abs(ab - bc), Math.abs(cd - da));
    maxDiag = Math.min(ab + bc, cd + da);
    tri1Name = '△ABC';
    tri2Name = '△ADC';
  } else {
    minDiag = Math.max(Math.abs(ab - da), Math.abs(bc - cd));
    maxDiag = Math.min(ab + da, bc + cd);
    tri1Name = '△ABD';
    tri2Name = '△BCD';
  }

  if (minDiag >= maxDiag - eps) {
    return {
      valid: false,
      errorCode: 'SIDES_CANNOT_CLOSE',
      areaSqFt: 0,
      perimeterFt,
      otherDiagonalFt: 0,
      averageMethodSqFt,
      averageOverestimatePct: 0,
      canBeConcave: false,
    };
  }

  if (diagonal <= minDiag + eps) {
    const failing =
      diagonalType === 'AC'
        ? diagonal <= Math.abs(ab - bc) + eps
          ? tri1Name
          : tri2Name
        : diagonal <= Math.abs(ab - da) + eps
          ? tri1Name
          : tri2Name;
    return {
      valid: false,
      errorCode: 'DIAGONAL_TOO_SHORT',
      failingTriangle: failing,
      validDiagonalRange: { min: minDiag, max: maxDiag },
      areaSqFt: 0,
      perimeterFt,
      otherDiagonalFt: 0,
      averageMethodSqFt,
      averageOverestimatePct: 0,
      canBeConcave: false,
    };
  }

  if (diagonal >= maxDiag - eps) {
    const failing =
      diagonalType === 'AC'
        ? diagonal >= ab + bc - eps
          ? tri1Name
          : tri2Name
        : diagonal >= ab + da - eps
          ? tri1Name
          : tri2Name;
    return {
      valid: false,
      errorCode: 'DIAGONAL_TOO_LONG',
      failingTriangle: failing,
      validDiagonalRange: { min: minDiag, max: maxDiag },
      areaSqFt: 0,
      perimeterFt,
      otherDiagonalFt: 0,
      averageMethodSqFt,
      averageOverestimatePct: 0,
      canBeConcave: false,
    };
  }

  // Test concave feasibility
  const concaveCandidate = buildVertices(ab, bc, cd, da, diagonal, diagonalType, 'concave');
  const concaveArea = Math.abs(
    polygonSignedArea([concaveCandidate.A, concaveCandidate.B, concaveCandidate.C, concaveCandidate.D])
  );
  const canBeConcave = !concaveCandidate.selfIntersecting && concaveArea > eps;

  const built = buildVertices(ab, bc, cd, da, diagonal, diagonalType, shapeMode);
  const builtSignedArea = Math.abs(polygonSignedArea([built.A, built.B, built.C, built.D]));
  if (built.selfIntersecting || builtSignedArea <= eps) {
    return {
      valid: false,
      errorCode: 'SELF_INTERSECTING',
      validDiagonalRange: { min: minDiag, max: maxDiag },
      areaSqFt: 0,
      perimeterFt,
      otherDiagonalFt: 0,
      averageMethodSqFt,
      averageOverestimatePct: 0,
      canBeConcave,
    };
  }

  const { A, B, C, D } = built;

  let t1Sides: [number, number, number];
  let t2Sides: [number, number, number];
  let t1Verts: [string, string, string];
  let t2Verts: [string, string, string];
  let t1Centroid: Point2D;
  let t2Centroid: Point2D;

  if (diagonalType === 'AC') {
    t1Sides = [ab, bc, diagonal];
    t2Sides = [cd, da, diagonal];
    t1Verts = ['A', 'B', 'C'];
    t2Verts = ['A', 'D', 'C'];
    t1Centroid = { x: (A.x + B.x + C.x) / 3, y: (A.y + B.y + C.y) / 3 };
    t2Centroid = { x: (A.x + D.x + C.x) / 3, y: (A.y + D.y + C.y) / 3 };
  } else {
    t1Sides = [ab, da, diagonal];
    t2Sides = [bc, cd, diagonal];
    t1Verts = ['A', 'B', 'D'];
    t2Verts = ['B', 'C', 'D'];
    t1Centroid = { x: (A.x + B.x + D.x) / 3, y: (A.y + B.y + D.y) / 3 };
    t2Centroid = { x: (B.x + C.x + D.x) / 3, y: (B.y + C.y + D.y) / 3 };
  }

  const area1 = heronArea(t1Sides[0], t1Sides[1], t1Sides[2]);
  const area2 = heronArea(t2Sides[0], t2Sides[1], t2Sides[2]);
  const exactArea = shapeMode === 'convex' ? area1 + area2 : Math.abs(area1 - area2);

  const otherDiagonalFt = diagonalType === 'AC' ? dist(B, D) : dist(A, C);
  const anglesDeg = computeInteriorAngles(A, B, C, D);
  const averageOverestimatePct =
    exactArea > eps ? ((averageMethodSqFt - exactArea) / exactArea) * 100 : 0;

  return {
    valid: true,
    vertices: { A, B, C, D },
    anglesDeg,
    areaSqFt: exactArea,
    perimeterFt,
    otherDiagonalFt,
    averageMethodSqFt,
    averageOverestimatePct,
    triangle1: {
      label: tri1Name,
      vertices: t1Verts,
      sides: t1Sides,
      semiPerimeter: (t1Sides[0] + t1Sides[1] + t1Sides[2]) / 2,
      areaSqFt: area1,
      centroid: t1Centroid,
    },
    triangle2: {
      label: tri2Name,
      vertices: t2Verts,
      sides: t2Sides,
      semiPerimeter: (t2Sides[0] + t2Sides[1] + t2Sides[2]) / 2,
      areaSqFt: area2,
      centroid: t2Centroid,
    },
    canBeConcave,
  };
}
