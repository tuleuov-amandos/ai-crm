import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware обёртки над next/navigation.
// Используй их вместо next/link и next/navigation внутри src/app/[locale]/**.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
