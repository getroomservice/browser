export function base64toArrayBuffer(vs: string) {
  var binary = window.atob(vs);
  var len = binary.length;
  var bytes = new Uint8Array(len);
  for (var i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function isOlderVS(older: string, newer: string): boolean {
  if (!older) return true;
  if (!newer) return false;

  // These are ALWAYS 10 bytes
  const olderArr = new Uint8Array(base64toArrayBuffer(older).slice(0, 9));
  const newerArr = new Uint8Array(base64toArrayBuffer(newer).slice(0, 9));

  for (let i = 0; i < olderArr.byteLength; i++) {
    if (newerArr[i] > olderArr[i]) return true;
    if (newerArr[i] < olderArr[i]) return false;
  }
  return false;
}
