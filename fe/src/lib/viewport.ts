// Phone = below the Tailwind md breakpoint (768 px). Client-only: call it from
// event handlers or effects, never during render (hydration).
export const PHONE_MEDIA_QUERY = "(max-width: 767px)";

export function isPhoneViewport(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia(PHONE_MEDIA_QUERY).matches
  );
}
