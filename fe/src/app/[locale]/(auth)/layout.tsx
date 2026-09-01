import { LanguageSwitcher } from "@/components/LanguageSwitcher";

function layoutAuth({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative">
      <div className="absolute right-4 top-4 z-50">
        <LanguageSwitcher className="w-auto min-w-[7.5rem] bg-background/80 backdrop-blur" />
      </div>
      {children}
    </main>
  );
}

export default layoutAuth;
