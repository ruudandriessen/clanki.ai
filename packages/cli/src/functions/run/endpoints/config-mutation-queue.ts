let configMutationQueue: Promise<void> = Promise.resolve();

export async function runSerializedConfigMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const resultPromise = configMutationQueue.then(mutation);
  configMutationQueue = resultPromise.then(
    () => undefined,
    () => undefined,
  );
  return await resultPromise;
}
