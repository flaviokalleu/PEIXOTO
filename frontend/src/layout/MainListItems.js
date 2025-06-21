import React, { useContext, useEffect, useReducer, useState } from "react";
import { Link as RouterLink, useLocation, useHistory } from "react-router-dom";
import useHelps from "../hooks/useHelps";

// Lucide icons
import {
  LayoutDashboard,
  MessageCircle,
  Users,
  Settings,
  Phone,
  Tag,
  HelpCircle,
  FileText,
  Layers,
  Bot,
  FolderKanban,
  CalendarClock,
  Link2,
  Building2,
  BadgePercent,
  ArrowRightLeft,
  FileStack,
  MessageSquareWarning,
  Coins,
  ListChecks,
  ChevronDown,
  ChevronUp,
  Megaphone,
  MessageCircleMore,
} from "lucide-react";

import { WhatsAppsContext } from "../context/WhatsApp/WhatsAppsContext";
import { AuthContext } from "../context/Auth/AuthContext";
import { useActiveMenu } from "../context/ActiveMenuContext";
import { Can } from "../components/Can";
import { isArray } from "lodash";
import api from "../services/api";
import toastError from "../errors/toastError";
import usePlans from "../hooks/usePlans";
import useVersion from "../hooks/useVersion";
import { i18n } from "../translate/i18n";

// Componente de Badge customizado
const Badge = ({ children, show, count, className = "" }) => (
  <div className={`relative ${className}`}>
    {children}
    {show && (
      <div className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full flex items-center justify-center">
        <span className="text-[10px] text-white font-semibold">
          {count || "!"}
        </span>
      </div>
    )}
  </div>
);

// Componente de Tooltip customizado
const Tooltip = ({ children, text, show }) => (
  <div className="relative group">
    {children}
    {show && (
      <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50">
        {text}
        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent border-r-gray-900 dark:border-r-gray-700"></div>
      </div>
    )}
  </div>
);

// Componente ListItemLink redesenhado
function ListItemLink({ icon, primary, to, tooltip, showBadge, small, isActive }) {
  const { user } = useContext(AuthContext);
  const history = useHistory();

  const checkUserAccess = () => {
    if (user?.company?.id === 1) return true;
    if (to === '/financeiro') return true;
    if (!user?.company?.invoices) return true;

    const hasUnpaidInvoice = user.company.invoices.some(invoice => {
      return invoice.companyId === user.company.id && invoice.status !== "paid";
    });

    return !hasUnpaidInvoice;
  };

  const isDisabled = !checkUserAccess();

  const handleClick = (e) => {
    if (isDisabled) {
      e.preventDefault();
      toastError('Você possui faturas em aberto. Por favor, regularize seu pagamento.');
      history.push('/financeiro');
    }
  };

  return (
    <Tooltip text={primary} show={!!tooltip}>
      <RouterLink
        to={to}
        onClick={handleClick}
        className={`
          group flex items-center gap-3 px-3 py-2.5 mx-2 mb-1 rounded-xl transition-all duration-300 ease-out
          ${small ? 'pl-6 py-2' : ''}
          ${isActive 
            ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/25 translate-x-1' 
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:translate-x-1'
          }
          ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          relative overflow-hidden
        `}
      >
        {/* Efeito de brilho no hover */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
        
        {icon && (
          <div className={`
            flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-300
            ${isActive 
              ? 'bg-white/20 text-white shadow-md' 
              : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/50 group-hover:scale-105'
            }
          `}>
            {showBadge ? (
              <Badge show={true}>
                {React.cloneElement(icon, { size: 18 })}
              </Badge>
            ) : (
              React.cloneElement(icon, { size: 18 })
            )}
          </div>
        )}
        
        <span className={`
          font-medium text-sm transition-all duration-200
          ${isActive ? 'text-white font-semibold' : 'group-hover:text-gray-900 dark:group-hover:text-white'}
        `}>
          {primary}
        </span>
      </RouterLink>
    </Tooltip>
  );
}

// Componente de seção expansível
const ExpandableSection = ({ 
  title, 
  icon, 
  isOpen, 
  onToggle, 
  isActive, 
  children, 
  tooltip,
  collapsed 
}) => (
  <div className="mb-1">
    <Tooltip text={title} show={collapsed}>
      <button
        onClick={onToggle}
        className={`
          w-full flex items-center gap-3 px-3 py-2.5 mx-2 rounded-xl transition-all duration-300 ease-out
          ${isActive 
            ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/25' 
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:translate-x-1'
          }
          group relative overflow-hidden
        `}
      >
        {/* Efeito de brilho */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
        
        <div className={`
          flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-300
          ${isActive 
            ? 'bg-white/20 text-white' 
            : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/50'
          }
        `}>
          {React.cloneElement(icon, { size: 18 })}
        </div>
        
        <span className={`
          flex-1 text-left font-medium text-sm
          ${isActive ? 'text-white font-semibold' : ''}
        `}>
          {title}
        </span>
        
        <ChevronDown 
          className={`
            w-4 h-4 transition-transform duration-300
            ${isOpen ? 'rotate-180' : ''}
            ${isActive ? 'text-white' : 'text-gray-500'}
          `} 
        />
      </button>
    </Tooltip>
    
    {/* Submenu com animação */}
    <div className={`
      overflow-hidden transition-all duration-300 ease-out
      ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
    `}>
      <div className="mx-2 mt-1 mb-2 bg-gradient-to-br from-slate-50/80 to-slate-100/80 dark:from-slate-800/50 dark:to-slate-900/50 backdrop-blur-sm rounded-lg border border-slate-200/50 dark:border-slate-700/50 p-2">
        {children}
      </div>
    </div>
  </div>
);

const reducer = (state, action) => {
  if (action.type === "LOAD_CHATS") {
    const chats = action.payload;
    const newChats = [];

    if (isArray(chats)) {
      chats.forEach((chat) => {
        const chatIndex = state.findIndex((u) => u.id === chat.id);
        if (chatIndex !== -1) {
          state[chatIndex] = chat;
        } else {
          newChats.push(chat);
        }
      });
    }

    return [...state, ...newChats];
  }

  if (action.type === "UPDATE_CHATS") {
    const chat = action.payload;
    const chatIndex = state.findIndex((u) => u.id === chat.id);

    if (chatIndex !== -1) {
      state[chatIndex] = chat;
      return [...state];
    } else {
      return [chat, ...state];
    }
  }

  if (action.type === "DELETE_CHAT") {
    const chatId = action.payload;
    const chatIndex = state.findIndex((u) => u.id === chatId);
    if (chatIndex !== -1) {
      state.splice(chatIndex, 1);
    }
    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }

  if (action.type === "CHANGE_CHAT") {
    const changedChats = state.map((chat) => {
      if (chat.id === action.payload.chat.id) {
        return action.payload.chat;
      }
      return chat;
    });
    return changedChats;
  }
};

const MainListItems = ({ collapsed, drawerClose }) => {
  const { whatsApps } = useContext(WhatsAppsContext);
  const { user, socket } = useContext(AuthContext);
  const { setActiveMenu } = useActiveMenu();
  const location = useLocation();

  const [connectionWarning, setConnectionWarning] = useState(false);
  const [openCampaignSubmenu, setOpenCampaignSubmenu] = useState(false);
  const [openFlowSubmenu, setOpenFlowSubmenu] = useState(false);
  const [openDashboardSubmenu, setOpenDashboardSubmenu] = useState(false);
  const [showCampaigns, setShowCampaigns] = useState(false);
  const [showKanban, setShowKanban] = useState(false);
  const [showOpenAi, setShowOpenAi] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [showSchedules, setShowSchedules] = useState(false);
  const [showInternalChat, setShowInternalChat] = useState(false);
  const [showExternalApi, setShowExternalApi] = useState(false);
  const [invisible, setInvisible] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [searchParam] = useState("");
  const [chats, dispatch] = useReducer(reducer, []);
  const [version, setVersion] = useState(false);
  const { list } = useHelps();
  const [hasHelps, setHasHelps] = useState(false);

  // Estados para verificar rotas ativas
  const isManagementActive =
    location.pathname === "/" || location.pathname.startsWith("/reports") || location.pathname.startsWith("/moments");

  const isCampaignRouteActive =
    location.pathname === "/campaigns" ||
    location.pathname.startsWith("/contact-lists") ||
    location.pathname.startsWith("/campaigns-config");

  const isFlowbuilderRouteActive = 
    location.pathname.startsWith("/phrase-lists") ||
    location.pathname.startsWith("/flowbuilders");

  // useEffects existentes...
  useEffect(() => {
    async function checkHelps() {
      const helps = await list();
      setHasHelps(helps.length > 0);
    }
    checkHelps();
  }, []);

  useEffect(() => {
    if (location.pathname.startsWith("/tickets")) {
      setActiveMenu("/tickets");
    } else {
      setActiveMenu("");
    }
  }, [location, setActiveMenu]);

  const { getPlanCompany } = usePlans();
  const { getVersion } = useVersion();

  useEffect(() => {
    async function fetchVersion() {
      const _version = await getVersion();
      setVersion(_version.version);
    }
    fetchVersion();
  }, []);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [searchParam]);

  useEffect(() => {
    async function fetchData() {
      if (!user?.companyId) return;
      const companyId = user.companyId;
      const planConfigs = await getPlanCompany(undefined, companyId);

      setShowCampaigns(planConfigs.plan.useCampaigns);
      setShowKanban(planConfigs.plan.useKanban);
      setShowOpenAi(planConfigs.plan.useOpenAi);
      setShowIntegrations(planConfigs.plan.useIntegrations);
      setShowSchedules(planConfigs.plan.useSchedules);
      setShowInternalChat(planConfigs.plan.useInternalChat);
      setShowExternalApi(planConfigs.plan.useExternalApi);
    }
    fetchData();
  }, [user?.companyId]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchChats();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchParam, pageNumber]);

  useEffect(() => {
    if (user.id) {
      const companyId = user.companyId;
      const onCompanyChatMainListItems = (data) => {
        if (data.action === "new-message") {
          dispatch({ type: "CHANGE_CHAT", payload: data });
        }
        if (data.action === "update") {
          dispatch({ type: "CHANGE_CHAT", payload: data });
        }
      };

      socket.on(`company-${companyId}-chat`, onCompanyChatMainListItems);
      return () => {
        socket.off(`company-${companyId}-chat`, onCompanyChatMainListItems);
      };
    }
  }, [socket, user.id, user.companyId]);

  useEffect(() => {
    let unreadsCount = 0;
    if (chats.length > 0) {
      for (let chat of chats) {
        for (let chatUser of chat.users) {
          if (chatUser.userId === user.id) {
            unreadsCount += chatUser.unreads;
          }
        }
      }
    }
    setInvisible(unreadsCount === 0);
  }, [chats, user.id]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (whatsApps.length > 0) {
        const offlineWhats = whatsApps.filter((whats) => {
          return (
            whats.status === "qrcode" ||
            whats.status === "PAIRING" ||
            whats.status === "DISCONNECTED" ||
            whats.status === "TIMEOUT" ||
            whats.status === "OPENING"
          );
        });
        setConnectionWarning(offlineWhats.length > 0);
      }
    }, 2000);
    return () => clearTimeout(delayDebounceFn);
  }, [whatsApps]);

  const fetchChats = async () => {
    try {
      const { data } = await api.get("/chats/", {
        params: { searchParam, pageNumber },
      });
      dispatch({ type: "LOAD_CHATS", payload: data.records });
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <div 
      className="flex flex-col h-full bg-gradient-to-b from-white to-gray-50/50 dark:from-gray-900 dark:to-gray-950 backdrop-blur-xl"
      onClick={drawerClose}
    >
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
        
        {/* Dashboard Section */}
        <div className="mb-4">
          <Can
            role={
              (user.profile === "user" && user.showDashboard === "enabled") || user.allowRealTime === "enabled"
                ? "admin"
                : user.profile
            }
            perform={"drawer-admin-items:view"}
            yes={() => (
              <ExpandableSection
                title={i18n.t("mainDrawer.listItems.management")}
                icon={<LayoutDashboard />}
                isOpen={openDashboardSubmenu}
                onToggle={() => setOpenDashboardSubmenu(!openDashboardSubmenu)}
                isActive={isManagementActive}
                collapsed={collapsed}
              >
                <Can
                  role={user.profile === "user" && user.showDashboard === "enabled" ? "admin" : user.profile}
                  perform={"drawer-admin-items:view"}
                  yes={() => (
                    <>
                      <ListItemLink
                        small
                        to="/"
                        primary="Dashboard"
                        icon={<LayoutDashboard />}
                        tooltip={collapsed}
                        isActive={location.pathname === "/"}
                      />
                      <ListItemLink
                        small
                        to="/reports"
                        primary={i18n.t("mainDrawer.listItems.reports")}
                        icon={<FileText />}
                        tooltip={collapsed}
                        isActive={location.pathname.startsWith("/reports")}
                      />
                    </>
                  )}
                />
                <Can
                  role={user.profile === "user" && user.allowRealTime === "enabled" ? "admin" : user.profile}
                  perform={"drawer-admin-items:view"}
                  yes={() => (
                    <ListItemLink
                      small
                      to="/moments"
                      primary={i18n.t("mainDrawer.listItems.chatsTempoReal")}
                      icon={<Layers />}
                      tooltip={collapsed}
                      isActive={location.pathname.startsWith("/moments")}
                    />
                  )}
                />
              </ExpandableSection>
            )}
          />
        </div>

        {/* Main Navigation */}
        <div className="mb-6">
          <ListItemLink
            to="/tickets"
            primary={i18n.t("mainDrawer.listItems.tickets")}
            icon={<MessageCircle />}
            tooltip={collapsed}
            isActive={location.pathname.startsWith("/tickets")}
          />

          <ListItemLink
            to="/quick-messages"
            primary={i18n.t("mainDrawer.listItems.quickMessages")}
            icon={<Bot />}
            tooltip={collapsed}
            isActive={location.pathname.startsWith("/quick-messages")}
          />

          {showKanban && (
            <ListItemLink
              to="/kanban"
              primary={i18n.t("mainDrawer.listItems.kanban")}
              icon={<FolderKanban />}
              tooltip={collapsed}
              isActive={location.pathname.startsWith("/kanban")}
            />
          )}

          <ListItemLink
            to="/contacts"
            primary={i18n.t("mainDrawer.listItems.contacts")}
            icon={<Phone />}
            tooltip={collapsed}
            isActive={location.pathname.startsWith("/contacts")}
          />

          {showSchedules && (
            <ListItemLink
              to="/schedules"
              primary={i18n.t("mainDrawer.listItems.schedules")}
              icon={<CalendarClock />}
              tooltip={collapsed}
              isActive={location.pathname.startsWith("/schedules")}
            />
          )}

          <ListItemLink
            to="/tags"
            primary={i18n.t("mainDrawer.listItems.tags")}
            icon={<Tag />}
            tooltip={collapsed}
            isActive={location.pathname.startsWith("/tags")}
          />

          {showInternalChat && (
            <ListItemLink
              to="/chats"
              primary={i18n.t("mainDrawer.listItems.chats")}
              icon={<MessageCircle />}
              tooltip={collapsed}
              showBadge={!invisible}
              isActive={location.pathname.startsWith("/chats")}
            />
          )}

          <ListItemLink
            to="/helps"
            primary={i18n.t("mainDrawer.listItems.helps")}
            icon={<HelpCircle />}
            tooltip={collapsed}
            isActive={location.pathname.startsWith("/helps")}
          />
        </div>

        {/* Administration Section */}
        <Can
          role={user.profile === "user" && user.allowConnections === "enabled" ? "admin" : user.profile}
          perform="dashboard:view"
          yes={() => (
            <div className="border-t border-gray-200/60 dark:border-gray-700/60 pt-4">
              {/* Section Header */}
              <div className="px-4 mb-3">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {i18n.t("mainDrawer.listItems.administration")}
                </h3>
              </div>

              {/* Campaigns Section */}
              {showCampaigns && (
                <Can
                  role={user.profile}
                  perform="dashboard:view"
                  yes={() => (
                    <ExpandableSection
                      title={i18n.t("mainDrawer.listItems.campaigns")}
                      icon={<MessageSquareWarning />}
                      isOpen={openCampaignSubmenu}
                      onToggle={() => setOpenCampaignSubmenu(!openCampaignSubmenu)}
                      isActive={isCampaignRouteActive}
                      collapsed={collapsed}
                    >
                      <ListItemLink
                        small
                        to="/campaigns"
                        primary={i18n.t("campaigns.subMenus.list")}
                        icon={<ListChecks />}
                        tooltip={collapsed}
                        isActive={location.pathname === "/campaigns"}
                      />
                      <ListItemLink
                        small
                        to="/contact-lists"
                        primary={i18n.t("campaigns.subMenus.listContacts")}
                        icon={<Users />}
                        tooltip={collapsed}
                        isActive={location.pathname.startsWith("/contact-lists")}
                      />
                      <ListItemLink
                        small
                        to="/campaigns-config"
                        primary={i18n.t("campaigns.subMenus.settings")}
                        icon={<Settings />}
                        tooltip={collapsed}
                        isActive={location.pathname.startsWith("/campaigns-config")}
                      />
                    </ExpandableSection>
                  )}
                />
              )}

              {/* Flowbuilder Section */}
              <Can
                role={user.profile}
                perform="dashboard:view"
                yes={() => (
                  <ExpandableSection
                    title="Flowbuilder"
                    icon={<Link2 />}
                    isOpen={openFlowSubmenu}
                    onToggle={() => setOpenFlowSubmenu(!openFlowSubmenu)}
                    isActive={isFlowbuilderRouteActive}
                    collapsed={collapsed}
                  >
                    <ListItemLink
                      small
                      to="/phrase-lists"
                      primary="Fluxo de Campanha"
                      icon={<MessageSquareWarning />}
                      tooltip={collapsed}
                      isActive={location.pathname.startsWith("/phrase-lists")}
                    />
                    <ListItemLink
                      small
                      to="/flowbuilders"
                      primary="Fluxo de conversa"
                      icon={<FileStack />}
                      tooltip={collapsed}
                      isActive={location.pathname.startsWith("/flowbuilders")}
                    />
                  </ExpandableSection>
                )}
              />

              {/* Other Admin Items */}
              {user.super && (
                <ListItemLink
                  to="/announcements"
                  primary={i18n.t("mainDrawer.listItems.annoucements")}
                  icon={<Megaphone />}
                  tooltip={collapsed}
                  isActive={location.pathname.startsWith("/announcements")}
                />
              )}

              {showExternalApi && (
                <Can
                  role={user.profile}
                  perform="dashboard:view"
                  yes={() => (
                    <ListItemLink
                      to="/messages-api"
                      primary={i18n.t("mainDrawer.listItems.messagesAPI")}
                      icon={<HelpCircle />}
                      tooltip={collapsed}
                      isActive={location.pathname.startsWith("/messages-api")}
                    />
                  )}
                />
              )}

              <Can
                role={user.profile}
                perform="dashboard:view"
                yes={() => (
                  <ListItemLink
                    to="/users"
                    primary={i18n.t("mainDrawer.listItems.users")}
                    icon={<Users />}
                    tooltip={collapsed}
                    isActive={location.pathname.startsWith("/users")}
                  />
                )}
              />

              <Can
                role={user.profile}
                perform="dashboard:view"
                yes={() => (
                  <ListItemLink
                    to="/queues"
                    primary={i18n.t("mainDrawer.listItems.queues")}
                    icon={<MessageCircleMore />}
                    tooltip={collapsed}
                    isActive={location.pathname.startsWith("/queues")}
                  />
                )}
              />

              {showOpenAi && (
                <Can
                  role={user.profile}
                  perform="dashboard:view"
                  yes={() => (
                    <ListItemLink
                      to="/prompts"
                      primary={i18n.t("mainDrawer.listItems.prompts")}
                      icon={<BadgePercent />}
                      tooltip={collapsed}
                      isActive={location.pathname.startsWith("/prompts")}
                    />
                  )}
                />
              )}

              {showIntegrations && (
                <Can
                  role={user.profile}
                  perform="dashboard:view"
                  yes={() => (
                    <ListItemLink
                      to="/queue-integration"
                      primary={i18n.t("mainDrawer.listItems.queueIntegration")}
                      icon={<Building2 />}
                      tooltip={collapsed}
                      isActive={location.pathname.startsWith("/queue-integration")}
                    />
                  )}
                />
              )}

              <Can
                role={user.profile === "user" && user.allowConnections === "enabled" ? "admin" : user.profile}
                perform={"drawer-admin-items:view"}
                yes={() => (
                  <ListItemLink
                    to="/connections"
                    primary={i18n.t("mainDrawer.listItems.connections")}
                    icon={<ArrowRightLeft />}
                    showBadge={connectionWarning}
                    tooltip={collapsed}
                    isActive={location.pathname.startsWith("/connections")}
                  />
                )}
              />

              {user.super && (
                <ListItemLink
                  to="/allConnections"
                  primary={i18n.t("mainDrawer.listItems.allConnections")}
                  icon={<FileText />}
                  tooltip={collapsed}
                  isActive={location.pathname.startsWith("/allConnections")}
                />
              )}

              <Can
                role={user.profile}
                perform="dashboard:view"
                yes={() => (
                  <ListItemLink
                    to="/files"
                    primary={i18n.t("mainDrawer.listItems.files")}
                    icon={<FileStack />}
                    tooltip={collapsed}
                    isActive={location.pathname.startsWith("/files")}
                  />
                )}
              />

              <Can
                role={user.profile}
                perform="dashboard:view"
                yes={() => (
                  <ListItemLink
                    to="/financeiro"
                    primary={i18n.t("mainDrawer.listItems.financeiro")}
                    icon={<Coins />}
                    tooltip={collapsed}
                    isActive={location.pathname.startsWith("/financeiro")}
                  />
                )}
              />

              <Can
                role={user.profile}
                perform="dashboard:view"
                yes={() => (
                  <ListItemLink
                    to="/settings"
                    primary={i18n.t("mainDrawer.listItems.settings")}
                    icon={<Settings />}
                    tooltip={collapsed}
                    isActive={location.pathname.startsWith("/settings")}
                  />
                )}
              />

              {user.super && (
                <ListItemLink
                  to="/companies"
                  primary={i18n.t("mainDrawer.listItems.companies")}
                  icon={<Building2 />}
                  tooltip={collapsed}
                  isActive={location.pathname.startsWith("/companies")}
                />
              )}
            </div>
          )}
        />
      </div>

      {/* Version Footer */}
      {!collapsed && version && (
        <div className="sticky bottom-0 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-gray-900 dark:via-gray-900/95 backdrop-blur-sm border-t border-gray-200/60 dark:border-gray-700/60 p-4 text-center">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-600 dark:text-gray-400 tracking-wide">
            v{version}
          </div>
        </div>
      )}
    </div>
  );
};

export default MainListItems;