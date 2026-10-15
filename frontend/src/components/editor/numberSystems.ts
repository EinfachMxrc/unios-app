// SPDX-License-Identifier: AGPL-3.0-or-later

export class NumberSystemError extends Error {}
type Rational = { numerator: bigint; denominator: bigint }
const digits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export function parseNumber(source: string, base: number): Rational {
  if (!Number.isInteger(base) || base < 2 || base > 36 || source.length > 128) throw new NumberSystemError('invalid')
  let text = source.trim().toUpperCase().replace(',', '.')
  const negative = text.startsWith('-')
  text = text.replace(/^[+-]/, '')
  const prefix = ({ 2: '0B', 8: '0O', 16: '0X' } as Record<number, string>)[base]
  if (prefix && text.startsWith(prefix)) text = text.slice(2)
  if (!/^[0-9A-Z]+(?:\.[0-9A-Z]+)?$/.test(text)) throw new NumberSystemError('invalid')
  const [whole, fraction = ''] = text.split('.')
  let numerator = 0n
  for (const digit of whole + fraction) {
    const value = digits.indexOf(digit)
    if (value < 0 || value >= base) throw new NumberSystemError('invalid')
    numerator = numerator * BigInt(base) + BigInt(value)
  }
  return { numerator: negative ? -numerator : numerator, denominator: BigInt(base) ** BigInt(fraction.length) }
}
export function formatNumber(value: Rational, base: number, places = 24): { text: string; exact: boolean } {
  if (!Number.isInteger(base) || base < 2 || base > 36 || value.denominator <= 0n || !Number.isInteger(places) || places < 0 || places > 64) throw new NumberSystemError('invalid')
  const magnitude = value.numerator < 0 ? -value.numerator : value.numerator
  let rest = magnitude % value.denominator
  let text = (value.numerator < 0 ? '-' : '') + (magnitude / value.denominator).toString(base).toUpperCase()
  if (rest) text += '.'
  for (let i = 0; rest && i < places; i++) {
    rest *= BigInt(base)
    text += digits[Number(rest / value.denominator)]
    rest %= value.denominator
  }
  return { text: text + (rest ? '…' : ''), exact: rest === 0n }
}
export function binaryWord(value: Rational, width: number): { bits: string; unsigned: string; signed: string } {
  if (!Number.isInteger(width) || width < 1 || width > 128 || value.numerator % value.denominator) throw new NumberSystemError('width')
  const n = value.numerator / value.denominator, modulus = 1n << BigInt(width)
  if (n < -(modulus >> 1n) || n >= modulus) throw new NumberSystemError('width')
  const unsigned = n < 0 ? modulus + n : n
  const signed = unsigned >= modulus / 2n ? unsigned - modulus : unsigned
  return { bits: unsigned.toString(2).padStart(width, '0'), unsigned: String(unsigned), signed: String(signed) }
}
export function placeValues(source: string, base: number): { digit: string; exponent: number; value: string }[] {
  // Parse first so no arbitrary Markdown/HTML can reach generated tables.
  parseNumber(source, base)
  let normalized = source.trim().toUpperCase().replace(',', '.').replace(/^[+-]/, '')
  const prefix = ({ 2: '0B', 8: '0O', 16: '0X' } as Record<number, string>)[base]
  if (prefix && normalized.startsWith(prefix)) normalized = normalized.slice(2)
  const [whole, fraction = ''] = normalized.split('.')
  return Array.from(whole + fraction, (digit, i) => {
    const exponent = whole.length - i - 1, coefficient = BigInt(digits.indexOf(digit))
    const value = exponent >= 0 ? String(coefficient * BigInt(base) ** BigInt(exponent))
      : `${coefficient}/${BigInt(base) ** BigInt(-exponent)}`
    return { digit, exponent, value }
  })
}
