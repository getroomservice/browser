export function escape(value: number | string): string {
  if (typeof value === 'number') return `${value}`;
  else return `"${value}"`;
}

export function unescape(value: string): string | number {
  if (
    value.length >= 2 &&
    value[0] === '"' &&
    value[value.length - 1] === '"'
  ) {
    return value.slice(1, value.length - 1);
  }

  return parseInt(value);
}
