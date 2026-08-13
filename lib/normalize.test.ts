import { describe, expect, it } from 'vitest';
import { toSearch, toSearchTokens, toStorage } from './normalize';

describe('toSearch', () => {
  it.each([
    // The acceptance criteria from PRD FR-14.
    ['Chuyên viên Tín dụng', 'chuyen vien tin dung'],
    ['Chuyên viên Quan hệ Khách hàng', 'chuyen vien quan he khach hang'],

    // đ / Đ have no canonical decomposition. These are the cases NFD alone gets wrong.
    ['đồng', 'dong'],
    ['Đồng', 'dong'],
    ['Ngân hàng TMCP Đầu tư và Phát triển', 'ngan hang tmcp dau tu va phat trien'],
    ['Giao dịch viên', 'giao dich vien'],

    // Every Vietnamese vowel form, including stacked marks.
    ['ăâêôơưđ ĂÂÊÔƠƯĐ', 'aaeooud aaeooud'],
    ['ế ộ ữ ỹ ạ', 'e o u y a'],

    // Real listings observed on bank career sites.
    [
      'Chuyên viên Cao cấp Quản lý Quan hệ Khách hàng Ưu tiên - Gold',
      'chuyen vien cao cap quan ly quan he khach hang uu tien gold',
    ],
    ['[2026_PTKSĐT] Chuyên viên Phát triển đối tác', '2026 ptksdt chuyen vien phat trien doi tac'],

    // Whitespace and punctuation collapse to single spaces; edges trimmed.
    ['  Chuyên   viên  ', 'chuyen vien'],
    ['Kế toán/Kiểm toán', 'ke toan kiem toan'],

    // Already plain, unchanged.
    ['devops engineer', 'devops engineer'],
    ['', ''],
  ])('folds %j to %j', (input, expected) => {
    expect(toSearch(input)).toBe(expected);
  });

  it('is idempotent', () => {
    const once = toSearch('Chuyên viên Tín dụng');
    expect(toSearch(once)).toBe(once);
  });

  it('produces identical output for NFC and NFD inputs', () => {
    const title = 'Chuyên viên Tín dụng';
    expect(toSearch(title.normalize('NFD'))).toBe(toSearch(title.normalize('NFC')));
  });

  it('strips characters that are tsquery operators', () => {
    // Security property, not cosmetics: user input must not be able to carry tsquery syntax
    // into a constructed query. See docs/adr/0004.
    const hostile = "tin & dung | !foo :* (bar) 'baz' <-> \\";
    const output = toSearch(hostile);

    expect(output).toBe('tin dung foo bar baz');
    expect(output).toMatch(/^[a-z0-9 ]*$/);
  });

  it('never emits characters outside [a-z0-9 ]', () => {
    const samples = [
      'Chuyên viên Tín dụng',
      'Giám đốc Chi nhánh — Đà Nẵng',
      '[2026_PTKSĐT] Chuyên viên',
      'Trưởng phòng KHDN (Hà Nội)',
    ];
    for (const sample of samples) {
      expect(toSearch(sample)).toMatch(/^[a-z0-9 ]*$/);
    }
  });
});

describe('toStorage', () => {
  it('returns NFC regardless of input form', () => {
    const title = 'Chuyên viên Tín dụng';
    expect(toStorage(title.normalize('NFD'))).toBe(title.normalize('NFC'));
    expect(toStorage(title.normalize('NFC'))).toBe(title.normalize('NFC'));
  });

  it('makes byte-different but visually identical titles compare equal', () => {
    const title = 'Chuyên viên Cao cấp';
    expect(title.normalize('NFD')).not.toBe(title.normalize('NFC'));
    expect(toStorage(title.normalize('NFD'))).toBe(toStorage(title.normalize('NFC')));
  });

  it('collapses whitespace and trims', () => {
    expect(toStorage('  Chuyên   viên \n Tín dụng  ')).toBe('Chuyên viên Tín dụng');
  });

  it('preserves diacritics and case', () => {
    // Storage form is the bank's own words, unmodified beyond whitespace. PRD AC-9.2, NFR-5.
    expect(toStorage('Chuyên viên Tín dụng')).toBe('Chuyên viên Tín dụng');
  });
});

describe('toSearchTokens', () => {
  it('splits a normalised query into tokens', () => {
    expect(toSearchTokens('Chuyên viên Tín dụng')).toEqual(['chuyen', 'vien', 'tin', 'dung']);
  });

  it('returns an empty array for blank input rather than an empty token', () => {
    // Callers treat [] as "no search applied". A [''] token would match nothing and silently
    // empty the result list.
    expect(toSearchTokens('')).toEqual([]);
    expect(toSearchTokens('   ')).toEqual([]);
    expect(toSearchTokens('!!!')).toEqual([]);
  });
});
