export function escape(value: number | string | object): string {
  return JSON.stringify(value);
}

export function unescape(value: string): string | number | object {
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}
