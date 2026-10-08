import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatSocketProvider } from "@/hooks/useChatSocket";
import { MobileTopbar } from "@/components/mobile-topbar";
import { DesktopOnlyRouteGate } from "@/components/desktop-only";
import { TenantStatusGate } from "@/components/tenant-status-gate";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <TenantStatusGate>
      <ChatSocketProvider>
        <div className="min-h-svh">
          <SidebarProvider
            style={{ "--sidebar-width": "200px" } as React.CSSProperties}
          >
            <div className="print:hidden">
              <AppSidebar />
            </div>
            <main className="flex flex-1 min-w-0 flex-col h-svh ">
              <MobileTopbar />
              {/* Страницы с корнем h-screen (contacts, roles, audit-logs) на
                  телефоне занимают остаток под полосой, а не 100vh. */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:[&>.h-screen]:h-full">
                <DesktopOnlyRouteGate>{children}</DesktopOnlyRouteGate>
              </div>
            </main>
          </SidebarProvider>
        </div>
      </ChatSocketProvider>
    </TenantStatusGate>
  );
}
