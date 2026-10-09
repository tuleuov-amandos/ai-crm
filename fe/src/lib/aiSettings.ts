// Pure helpers behind Settings → Integrations (AI key), free of React and path
// aliases so they can be unit-tested (aiSettings.test.mjs). Limits mirror
// be/src/routes/ai-settings/ai-settings.model.ts.

export const AI_PROVIDERS = ["openai", "groq", "anthropic"] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_KEY_MIN_LENGTH = 10;
export const AI_KEY_MAX_LENGTH = 500;

// The placeholder only hints at the key format of the provider.
export const AI_PROVIDER_OPTIONS: readonly {
  value: AiProvider;
  label: string;
  placeholder: string;
}[] = [
  { value: "openai", label: "OpenAI", placeholder: "sk-…" },
  { value: "groq", label: "Groq", placeholder: "gsk_…" },
  { value: "anthropic", label: "Anthropic", placeholder: "sk-ant-…" },
];

const findProvider = (provider?: string | null) =>
  AI_PROVIDER_OPTIONS.find((p) => p.value === provider);

export const providerLabel = (provider?: string | null): string =>
  findProvider(provider)?.label ?? "";

export const providerPlaceholder = (provider?: string | null): string =>
  findProvider(provider)?.placeholder ?? "";

// "····1234" for the stored key; dots only when the tail is not known.
export const maskKeyLast4 = (last4?: string | null): string => `····${last4 ?? ""}`;

// The backend trims the key before checking its length.
export const isApiKeyLengthValid = (apiKey: string): boolean => {
  const length = apiKey.trim().length;
  return length >= AI_KEY_MIN_LENGTH && length <= AI_KEY_MAX_LENGTH;
};
