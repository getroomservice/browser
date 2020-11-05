export function throttleByFirstArgument<T extends Function>(
  callback: T,
  wait: number,
  immediate = false
): T {
  // @ts-ignore
  let timeouts = {} as any;
  let initialCall = true;

  return function () {
    const callNow = immediate && initialCall;
    const next = () => {
      // @ts-ignore
      callback.apply(this, arguments);

      // @ts-ignore
      timeouts[arguments[0]] = null;
    };

    if (callNow) {
      initialCall = false;
      next();
    }

    // @ts-ignore
    if (!timeouts[arguments[0]]) {
      timeouts[arguments[0]] = setTimeout(next, wait);
    }
  } as any;
}
