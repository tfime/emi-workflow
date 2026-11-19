/** Số tiền đề nghị (VND) — số dương, cho phép thập phân (dấu phẩy). */

export interface IAmountParseResult {
  raw: string;
  value: number;
  ok: boolean;
  error: string;
}

const MAX_DECIMALS = 2;
const MAX_INT_DIGITS = 15;

/** Chuẩn hoá khi gõ: `1.234.567,89` (vi-VN). */
export function formatAmountInput(input: string): string {
  const raw = (input || '').replace(/[^\d.,]/g, '');
  if (!raw) return '';

  let intDigits = '';
  let decDigits = '';
  let hasComma = false;

  const commaIdx = raw.indexOf(',');
  if (commaIdx >= 0) {
    hasComma = true;
    intDigits = raw.slice(0, commaIdx).replace(/[^\d]/g, '');
    decDigits = raw.slice(commaIdx + 1).replace(/[^\d]/g, '').slice(0, MAX_DECIMALS);
  } else {
    // Chỉ dấu chấm: coi là phân tách nghìn (không phải thập phân).
    intDigits = raw.replace(/[^\d]/g, '');
  }

  if (!intDigits && !hasComma) return '';
  if (!intDigits) intDigits = '0';

  intDigits = intDigits.replace(/^0+(?=\d)/, '');
  if (!intDigits) intDigits = '0';

  const grouped = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (hasComma) {
    return `${grouped},${decDigits}`;
  }
  return grouped;
}

/** Hiển thị số đã lưu (Number) → chuỗi vi-VN có thập phân. */
export function formatAmountFromNumber(n: number): string {
  if (!isFinite(n)) return '';
  const fixed = Math.abs(n).toFixed(MAX_DECIMALS);
  const parts = fixed.split('.');
  return formatAmountInput(`${parts[0]},${parts[1]}`);
}

/** @deprecated dùng formatAmountInput trên cả chuỗi nhập. */
export function digitsOnly(input: string): string {
  return (input || '').replace(/[^\d]/g, '');
}

export function parseAmountInput(input: string): IAmountParseResult {
  const raw = (input || '').trim();
  if (!raw) {
    return { raw, value: 0, ok: false, error: 'Nhập số tiền đề nghị.' };
  }

  const normalized = raw.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return {
      raw,
      value: 0,
      ok: false,
      error: 'Số tiền không hợp lệ (vd. 1.000.000 hoặc 1.000.000,50).'
    };
  }

  const parts = normalized.split('.');
  if (parts[0].length > MAX_INT_DIGITS) {
    return { raw, value: 0, ok: false, error: 'Số tiền quá lớn.' };
  }
  if (parts[1] && parts[1].length > MAX_DECIMALS) {
    return {
      raw,
      value: 0,
      ok: false,
      error: `Tối đa ${MAX_DECIMALS} chữ số thập phân.`
    };
  }

  const value = Number(normalized);
  if (!isFinite(value) || value <= 0) {
    return { raw, value: 0, ok: false, error: 'Số tiền phải lớn hơn 0.' };
  }
  return { raw, value, ok: true, error: '' };
}

export function amountError(input: string): string {
  return parseAmountInput(input).error;
}
