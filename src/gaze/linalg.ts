/** Solves A x = b by Gaussian elimination with partial pivoting. Returns null if A is singular. */
export function solve(a: readonly (readonly number[])[], b: readonly number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i] ?? 0]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r]?.[col] ?? 0) > Math.abs(m[pivot]?.[col] ?? 0)) pivot = r;
    }
    const pivotRow = m[pivot];
    const colRow = m[col];
    if (!pivotRow || !colRow || Math.abs(pivotRow[col] ?? 0) < 1e-12) return null;
    m[pivot] = colRow;
    m[col] = pivotRow;
    for (let r = col + 1; r < n; r++) {
      const row = m[r];
      if (!row) continue;
      const f = (row[col] ?? 0) / (pivotRow[col] ?? 1);
      for (let c = col; c <= n; c++) row[c] = (row[c] ?? 0) - f * (pivotRow[c] ?? 0);
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    const row = m[r];
    if (!row) return null;
    let s = row[n] ?? 0;
    for (let c = r + 1; c < n; c++) s -= (row[c] ?? 0) * (x[c] ?? 0);
    x[r] = s / (row[r] ?? 1);
  }
  return x;
}

/** Median of each column. */
export function columnMedians(rows: readonly (readonly number[])[]): number[] {
  const width = rows[0]?.length ?? 0;
  return Array.from({ length: width }, (_, j) => median(rows.map((r) => r[j] ?? 0)));
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] ?? NaN) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}
