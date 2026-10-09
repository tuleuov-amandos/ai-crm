import { axiosInstance } from "@/lib/api";
import {
  AiSettings,
  AiSettingsResSchema,
  UpdateAiSettingsBodyType,
} from "@/lib/validations/aiSettings.schema";

// The backend makes a test call to the provider before saving (up to ~10 s),
// which is the axios default timeout, so this request gets its own.
const UPDATE_TIMEOUT_MS = 25_000;

export const aiSettingsService = {
  get: async (): Promise<AiSettings> => {
    const res = await axiosInstance.get("ai/settings");
    return AiSettingsResSchema.parse(res.data);
  },

  update: async (data: UpdateAiSettingsBodyType): Promise<AiSettings> => {
    const res = await axiosInstance.put("ai/settings", data, {
      timeout: UPDATE_TIMEOUT_MS,
    });
    return AiSettingsResSchema.parse(res.data);
  },

  remove: async (): Promise<void> => {
    await axiosInstance.delete("ai/settings");
  },
};
