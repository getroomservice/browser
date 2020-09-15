export function escape(value: number | string | object): string {
  return JSON.stringify(value);
}

export function unescape(value: string): string | number | object {
  if (
    value.length >= 2 &&
    value[0] === '"' &&
    value[value.length - 1] === '"'
  ) {
    return value.slice(1, value.length - 1);
  }

  return JSON.parse(value);
}
