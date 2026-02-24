import { useEffect, useState } from "react";

type SetStateAction<T> = T | ((previousState: T) => T);

export type SessionStateKey<T> = {
  storageKey: string;
  parse: (rawValue: string) => T;
  serialize: (value: T) => string;
};

function createSessionStateKey<T>(
  storageKey: string,
  options?: {
    parse?: (rawValue: string) => T;
    serialize?: (value: T) => string;
  },
): SessionStateKey<T> {
  return {
    storageKey,
    parse: options?.parse ?? defaultParse,
    serialize: options?.serialize ?? defaultSerialize,
  };
}

export function useSessionState<T>(
  key: SessionStateKey<T>,
  initialState: T | (() => T),
): [T, (nextState: SetStateAction<T>) => void] {
  const { parse, serialize, storageKey } = key;
  const [state, setState] = useState<T>(() =>
    getInitialSessionState(storageKey, parse, initialState),
  );

  useEffect(() => {
    setState(getInitialSessionState(storageKey, parse, initialState));
  }, [initialState, parse, storageKey]);

  const setSessionState = (nextState: SetStateAction<T>) => {
    setState((previousState) => {
      const resolvedState =
        typeof nextState === "function"
          ? (nextState as (previousState: T) => T)(previousState)
          : nextState;

      if (canUseSessionStorage()) {
        try {
          globalThis.sessionStorage.setItem(storageKey, serialize(resolvedState));
        } catch {
          return resolvedState;
        }
      }

      return resolvedState;
    });
  };

  return [state, setSessionState];
}

function resolveInitialState<T>(initialState: T | (() => T)): T {
  return typeof initialState === "function" ? (initialState as () => T)() : initialState;
}

function getInitialSessionState<T>(
  storageKey: string,
  parse: (rawValue: string) => T,
  initialState: T | (() => T),
): T {
  const resolvedInitialState = resolveInitialState(initialState);

  if (!canUseSessionStorage()) {
    return resolvedInitialState;
  }

  try {
    const persistedValue = globalThis.sessionStorage.getItem(storageKey);
    if (persistedValue === null) {
      return resolvedInitialState;
    }

    return parse(persistedValue);
  } catch {
    return resolvedInitialState;
  }
}

function defaultParse<T>(rawValue: string): T {
  return JSON.parse(rawValue) as T;
}

function defaultSerialize<T>(value: T): string {
  return JSON.stringify(value);
}

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined";
}

export const sessionStateKeys = {
  taskInput: (taskId: string) => createSessionStateKey<string>(`task-input:${taskId}`),
};
