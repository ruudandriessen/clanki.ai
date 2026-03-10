import { useRef, useState } from "react";

type SetStateAction<T> = T | ((previousState: T) => T);

type BrowserStorageKind = "local" | "session";

export type StorageStateKey<T> = {
    storage: BrowserStorageKind;
    storageKey: string;
    parse: (rawValue: string) => T;
    serialize: (value: T) => string;
};

function createStorageStateKey<T>(
    storage: BrowserStorageKind,
    storageKey: string,
    options?: {
        parse?: (rawValue: string) => T;
        serialize?: (value: T) => string;
    },
): StorageStateKey<T> {
    return {
        storage,
        storageKey,
        parse: options?.parse ?? defaultParse,
        serialize: options?.serialize ?? defaultSerialize,
    };
}

function useStorageState<T>(
    key: StorageStateKey<T>,
    initialState: T | (() => T),
): [T, (nextState: SetStateAction<T>) => void] {
    const { parse, serialize, storage, storageKey } = key;
    const prevKeyRef = useRef(storageKey);
    const [state, setState] = useState<T>(() =>
        getInitialStorageState(storage, storageKey, parse, initialState),
    );

    if (prevKeyRef.current !== storageKey) {
        prevKeyRef.current = storageKey;
        setState(getInitialStorageState(storage, storageKey, parse, initialState));
    }

    const setStorageState = (nextState: SetStateAction<T>) => {
        setState((previousState) => {
            const resolvedState =
                typeof nextState === "function"
                    ? (nextState as (previousState: T) => T)(previousState)
                    : nextState;

            const browserStorage = getBrowserStorage(storage);

            if (browserStorage) {
                try {
                    browserStorage.setItem(storageKey, serialize(resolvedState));
                } catch {
                    return resolvedState;
                }
            }

            return resolvedState;
        });
    };

    return [state, setStorageState];
}

export function useSessionState<T>(
    key: StorageStateKey<T>,
    initialState: T | (() => T),
): [T, (nextState: SetStateAction<T>) => void] {
    return useStorageState(key, initialState);
}

export function useLocalStorageState<T>(
    key: StorageStateKey<T>,
    initialState: T | (() => T),
): [T, (nextState: SetStateAction<T>) => void] {
    return useStorageState(key, initialState);
}

function resolveInitialState<T>(initialState: T | (() => T)): T {
    return typeof initialState === "function" ? (initialState as () => T)() : initialState;
}

function getInitialStorageState<T>(
    storage: BrowserStorageKind,
    storageKey: string,
    parse: (rawValue: string) => T,
    initialState: T | (() => T),
): T {
    const resolvedInitialState = resolveInitialState(initialState);
    const browserStorage = getBrowserStorage(storage);

    if (!browserStorage) {
        return resolvedInitialState;
    }

    try {
        const persistedValue = browserStorage.getItem(storageKey);
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

function getBrowserStorage(storage: BrowserStorageKind): Storage | null {
    if (typeof window === "undefined") {
        return null;
    }

    return storage === "local" ? globalThis.localStorage : globalThis.sessionStorage;
}

export const sessionStateKeys = {
    taskInput: (taskId: string) => createStorageStateKey<string>("session", `task-input:${taskId}`),
    taskModel: (taskId: string) =>
        createStorageStateKey<{ model: string; provider: string } | null>(
            "session",
            `task-model:${taskId}`,
        ),
    taskView: (taskId: string) =>
        createStorageStateKey<"chat" | "code">("session", `task-view:${taskId}`, {
            parse: (value) => (value === "code" ? "code" : "chat"),
            serialize: (value) => value,
        }),
};

export const localStorageKeys = {
    lastUsedTaskModel: () =>
        createStorageStateKey<{ model: string; provider: string } | null>(
            "local",
            "last-used-task-model",
        ),
    theme: () =>
        createStorageStateKey<"light" | "dark">("local", "theme", {
            parse: (value) => (value === "dark" ? "dark" : "light"),
            serialize: (value) => value,
        }),
};
