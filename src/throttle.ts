export default function throttle<T extends Function>(
  callback: T,
  wait: number,
  immediate = false
): T {
  // @ts-ignore
  let timeout = null;
  let initialCall = true;

  return function() {
    const callNow = immediate && initialCall;
    const next = () => {
      // @ts-ignore
      callback.apply(this, arguments);
      timeout = null;
    };

    if (callNow) {
      initialCall = false;
      next();
    }

    // @ts-ignore
    if (!timeout) {
      timeout = setTimeout(next, wait);
    }
  } as any;
}
