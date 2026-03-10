import { useQuery } from "@tanstack/react-query";
import {
    listDesktopRunnerModels,
    type DesktopRunnerModelSelection,
    type ListDesktopRunnerModelsResponse,
} from "@/lib/desktop-runner";
import { isDesktopApp } from "@/lib/is-desktop-app";

export type RunnerModelOption = {
    label: string;
    model: string;
    modelName: string;
    provider: string;
    providerName: string;
    value: string;
};

export type RunnerModelOptionGroup = {
    options: RunnerModelOption[];
    provider: string;
    providerName: string;
};

const RUNNER_MODELS_QUERY_KEY = ["runner-models"] as const;

export function useRunnerModels(directory: string | null) {
    const desktopApp = isDesktopApp();
    const normalizedDirectory = directory?.trim() ?? "";

    return useQuery({
        queryKey: RUNNER_MODELS_QUERY_KEY,
        queryFn: async () =>
            await listDesktopRunnerModels({
                directory: normalizedDirectory,
            }),
        enabled: desktopApp && normalizedDirectory.length > 0,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        staleTime: Number.POSITIVE_INFINITY,
    });
}

export function getDefaultRunnerModelSelection(
    response: ListDesktopRunnerModelsResponse | undefined,
): DesktopRunnerModelSelection | null {
    const options = getRunnerModelOptions(response);

    if (options.length === 0) {
        return null;
    }

    const defaultProviderId = response?.connected.find((providerId) =>
        options.some((option) => option.provider === providerId),
    );

    if (defaultProviderId) {
        const defaultModelId = response?.default[defaultProviderId];
        if (defaultModelId) {
            const defaultOption = options.find(
                (option) =>
                    option.provider === defaultProviderId && option.model === defaultModelId,
            );

            if (defaultOption) {
                return toRunnerModelSelection(defaultOption);
            }
        }
    }

    return toRunnerModelSelection(options[0]);
}

export function getRunnerModelOptions(
    response: ListDesktopRunnerModelsResponse | undefined,
): RunnerModelOption[] {
    if (!response || response.connected.length === 0) {
        return [];
    }

    const connectedProviderIds = new Set(response.connected);

    return response.providers
        .filter((provider) => connectedProviderIds.has(provider.id))
        .toSorted(
            (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
        )
        .flatMap((provider) =>
            Object.values(provider.models)
                .toSorted(
                    (left, right) =>
                        left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
                )
                .map((model) => ({
                    label: `${provider.name} · ${model.name}`,
                    model: model.id,
                    modelName: model.name,
                    provider: provider.id,
                    providerName: provider.name,
                    value: serializeRunnerModelSelection({
                        model: model.id,
                        provider: provider.id,
                    }),
                })),
        );
}

export function getRunnerModelOptionGroups(options: RunnerModelOption[]): RunnerModelOptionGroup[] {
    const groups = new Map<string, RunnerModelOptionGroup>();

    for (const option of options) {
        const existingGroup = groups.get(option.provider);
        if (existingGroup) {
            existingGroup.options.push(option);
            continue;
        }

        groups.set(option.provider, {
            options: [option],
            provider: option.provider,
            providerName: option.providerName,
        });
    }

    return [...groups.values()];
}

export function isRunnerModelSelectionAvailable(
    selection: DesktopRunnerModelSelection | null,
    options: RunnerModelOption[],
): boolean {
    if (!selection) {
        return false;
    }

    return options.some(
        (option) => option.model === selection.model && option.provider === selection.provider,
    );
}

export function parseRunnerModelSelection(
    value: string,
    options: RunnerModelOption[],
): DesktopRunnerModelSelection | null {
    const option = options.find((candidate) => candidate.value === value);
    return option ? toRunnerModelSelection(option) : null;
}

export function serializeRunnerModelSelection(
    selection: DesktopRunnerModelSelection | null,
): string {
    if (!selection) {
        return "";
    }

    return `${selection.provider}:${selection.model}`;
}

function toRunnerModelSelection(option: RunnerModelOption): DesktopRunnerModelSelection {
    return {
        model: option.model,
        provider: option.provider,
    };
}
