import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { ChatProvider, useChat } from './context/ChatContext.tsx';
import { CallProvider } from './context/CallContext.tsx';
import { LanguageProvider } from './i18n.tsx';
import { AuthView } from './components/AuthView.tsx';
import { Navbar } from './components/Navbar.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { ChatArea } from './components/ChatArea.tsx';
import { UserProfileModal } from './components/UserProfileModal.tsx';
import { NewChatModal } from './components/NewChatModal.tsx';
import { AdminPanel } from './components/AdminPanel.tsx';
import { GroupInfoModal } from './components/GroupInfoModal.tsx';
import { IncomingCallModal } from './components/IncomingCallModal.tsx';
import { ActiveCallModal } from './components/ActiveCallModal.tsx';
import { CallsModal } from './components/CallsModal.tsx';
import { MobileBottomNav } from './components/MobileBottomNav.tsx';
import { Shield } from 'lucide-react';

function MainApp() {
  const { user, isLoading, isAdmin } = useAuth();
  const { activeConversation, setActiveConversationId } = useChat();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const [isCallsOpen, setIsCallsOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'chats' | 'calls' | 'settings'>('chats');
  const [mobileShowChat, setMobileShowChat] = useState(false);

  // Sync mobile chat view with active conversation
  useEffect(() => {
    if (activeConversation) {
      setMobileShowChat(true);
    }
  }, [activeConversation]);

  // Protect and handle /admin routing
  useEffect(() => {
    const checkAdminRoute = () => {
      const isRouteAdmin =
        window.location.pathname === '/admin' ||
        window.location.pathname.startsWith('/admin/') ||
        window.location.hash.toLowerCase().includes('admin');

      if (isRouteAdmin) {
        if (!user) {
          window.history.replaceState(null, '', '/');
          setIsAdminOpen(false);
        } else if (isAdmin) {
          setIsAdminOpen(true);
        } else {
          // Non-admin or guest attempting to access /admin -> redirect to chat room
          window.history.replaceState(null, '', '/');
          setIsAdminOpen(false);
        }
      }
    };

    checkAdminRoute();
    window.addEventListener('popstate', checkAdminRoute);
    window.addEventListener('hashchange', checkAdminRoute);
    return () => {
      window.removeEventListener('popstate', checkAdminRoute);
      window.removeEventListener('hashchange', checkAdminRoute);
    };
  }, [user, isAdmin]);

  // Ensure non-admin users can never keep admin open
  useEffect(() => {
    if (!isAdmin && isAdminOpen) {
      setIsAdminOpen(false);
    }
  }, [isAdmin, isAdminOpen]);

  if (isLoading) {
    return (
      <div className="h-[100dvh] w-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 select-none">
        <div className="w-12 h-12 rounded-2xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4 animate-pulse">
          <Shield className="w-6 h-6" />
        </div>
        <p className="text-sm font-semibold text-slate-200">Initializing Vent Privacy Layer...</p>
        <p className="text-xs text-slate-500 mt-1">Establishing encrypted WebRTC & WebSocket session</p>
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  const isChatActiveOnMobile = Boolean(activeConversation) && mobileShowChat;

  return (
    <div className="h-[100dvh] w-screen bg-slate-950 flex flex-col overflow-hidden text-slate-100 font-sans select-none overscroll-none">
      {/* Top Navbar: On mobile only visible when NOT inside an active chat; on desktop (md:) always visible */}
      <div className={isChatActiveOnMobile ? 'hidden md:block shrink-0' : 'block shrink-0'}>
        <Navbar
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenAdmin={() => setIsAdminOpen(true)}
          onOpenNewChat={() => setIsNewChatOpen(true)}
          isAdminViewOpen={isAdminOpen}
        />
      </div>

      {/* Main Workspace Area */}
      <main className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Left Sidebar (Chats List): Full width on mobile when no chat is open; fixed width on desktop */}
        <div
          className={`${
            isChatActiveOnMobile ? 'hidden md:flex' : 'flex'
          } w-full md:w-80 lg:w-96 h-full z-10 shrink-0 md:border-r md:border-slate-800 flex-col overflow-hidden`}
        >
          <Sidebar
            onOpenNewChat={() => setIsNewChatOpen(true)}
            onSelectConversationMobile={() => setMobileShowChat(true)}
          />
        </div>

        {/* Center/Right Active Chat Area: Full width on mobile when chat is open; flex-1 on desktop */}
        <div
          className={`${
            !isChatActiveOnMobile ? 'hidden md:flex' : 'flex'
          } flex-1 w-full md:w-auto h-full z-10 min-w-0 flex-col overflow-hidden`}
        >
          <ChatArea
            onOpenInfoModal={() => setIsGroupInfoOpen(true)}
            onBackMobile={() => {
              setMobileShowChat(false);
              setActiveConversationId(null);
            }}
          />
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar (< 768px when on the main chat list overview) */}
      {!isChatActiveOnMobile && (
        <MobileBottomNav
          currentTab={mobileTab}
          onSelectTab={(tab) => {
            setMobileTab(tab);
            if (tab === 'calls') setIsCallsOpen(true);
            if (tab === 'settings') setIsProfileOpen(true);
          }}
          onOpenNewChat={() => setIsNewChatOpen(true)}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenAdmin={() => setIsAdminOpen(true)}
          onOpenCallsModal={() => setIsCallsOpen(true)}
        />
      )}

      {/* Modals & Overlays */}
      {isProfileOpen && <UserProfileModal onClose={() => setIsProfileOpen(false)} />}

      {isNewChatOpen && <NewChatModal onClose={() => setIsNewChatOpen(false)} />}

      {isAdminOpen && isAdmin && <AdminPanel onClose={() => setIsAdminOpen(false)} />}

      {isCallsOpen && <CallsModal onClose={() => setIsCallsOpen(false)} />}

      {isGroupInfoOpen && activeConversation && (
        <GroupInfoModal
          conversation={activeConversation}
          onClose={() => setIsGroupInfoOpen(false)}
        />
      )}

      {/* WebRTC Calling Modals */}
      <IncomingCallModal />
      <ActiveCallModal />
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <ChatProvider>
          <CallProvider>
            <MainApp />
          </CallProvider>
        </ChatProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
