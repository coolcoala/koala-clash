/* eslint-disable @typescript-eslint/no-explicit-any */
export interface DebouncedFunction<T extends (...args: any[]) => void> {
  (...args: Parameters<T>): void
  cancel(): void
  flush(): void
}

export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): DebouncedFunction<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null
  let lastArgs: Parameters<T> | null = null

  const invoke = (): void => {
    timeout = null
    if (lastArgs) {
      const args = lastArgs
      lastArgs = null
      func(...args)
    }
  }

  const debounced = ((...args: Parameters<T>) => {
    lastArgs = args
    if (timeout !== null) clearTimeout(timeout)
    timeout = setTimeout(invoke, wait)
  }) as DebouncedFunction<T>

  debounced.cancel = (): void => {
    if (timeout !== null) {
      clearTimeout(timeout)
      timeout = null
    }
    lastArgs = null
  }

  debounced.flush = (): void => {
    if (timeout !== null) {
      clearTimeout(timeout)
      invoke()
    }
  }

  return debounced
}
