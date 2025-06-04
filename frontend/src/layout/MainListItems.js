import React, { useContext, useEffect, useReducer, useState } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";
import {
  Zap,
  Settings2,
  Users2,
  UserRound,
  GitBranch,
  HelpCircle,
  Code2,
  Trello,
  Clock3,
  Hash,
  MessagesSquare,
  ChevronDown,
  ChevronRight,
  List,
  Calendar,
  Webhook,
  Shapes,
  Megaphone,
  Smartphone,
  Paperclip,
  CreditCard,
  Building2,
  RotateCcw,
  Infinity,
  Network,
  BarChart3,
  Activity,
  Phone,
  Bot,
} from "lucide-react";
import { LayoutGrid } from "lucide-react";
import { MessageSquareText } from "lucide-react";
import { WhatsAppsContext } from "../context/WhatsApp/WhatsAppsContext";
import { AuthContext } from "../context/Auth/AuthContext";
import { useActiveMenu } from "../context/ActiveMenuContext";
import { Can } from "../components/Can";
import { isArray } from "lodash";
import api from "../services/api";
import toastError from "../errors/toastError";
import usePlans from "../hooks/usePlans";
import useVersion from "../hooks/useVersion";
import useHelps from "../hooks/useHelps";
import { i18n } from "../translate/i18n";
import moment from "moment";

function ListItemLink({ icon, primary, to, tooltip, showBadge }) {
  const { activeMenu } = useActiveMenu();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const isActive = activeMenu === to || location.pathname === to;

  // Add this function inside ListItemLink
  const checkSubscriptionValid = () => {
    if (!user?.company?.dueDate) return false;
    if (user.company.id === 1) return true;
    if (to === '/financeiro') return true;
    
    const dueDate = moment(user.company.dueDate);
    const today = moment();
    return today.isBefore(dueDate);
  };

  const isDisabled = !checkSubscriptionValid();

  return (
    <li className="mb-1">
      <div className={`group relative ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <RouterLink
          to={isDisabled ? '#' : to}
          className={`flex items-center gap-3 px-3 py-2.5 mx-2 rounded-lg transition-all duration-200 ease-in-out ${
            isActive
              ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25"
              : "text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-white"
          }`}
          onClick={(e) => {
            if (isDisabled) {
              e.preventDefault();
            }
          }}
        >
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200 ${
              isActive
                ? "bg-white/20 text-white"
                : "bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-300 group-hover:bg-gray-200 dark:group-hover:bg-gray-600 group-hover:text-blue-600 dark:group-hover:text-blue-400"
            }`}
          >
            {showBadge ? (
              <div className="relative">
                {React.cloneElement(icon, { size: 18, strokeWidth: 2 })}
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-gray-900"></span>
              </div>
            ) : (
              React.cloneElement(icon, { size: 18, strokeWidth: 2 })
            )}
          </div>
          {!tooltip && (
            <span className="text-sm font-medium truncate">{primary}</span>
          )}
        </RouterLink>
        {tooltip && (
          <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center z-50">
            <div className="bg-gray-800 dark:bg-gray-700 text-white dark:text-gray-200 text-xs rounded-md py-2 px-3 shadow-lg whitespace-nowrap">
              {primary}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-gray-800 dark:bg-gray-700 rotate-45"></div>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

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
  const [hasHelps, setHasHelps] = useState(false);
  const [isSubscriptionValid, setIsSubscriptionValid] = useState(true);

  const { list } = useHelps();
  const { getPlanCompany } = usePlans();
  const { getVersion } = useVersion();

  useEffect(() => {
    async function checkHelps() {
      const helps = await list();
      setHasHelps(helps.length > 0);
    }
    checkHelps();
  }, []);

  const isManagementActive =
    location.pathname === "/" || location.pathname.startsWith("/reports") || location.pathname.startsWith("/moments");

  const isCampaignRouteActive =
    location.pathname === "/campaigns" ||
    location.pathname.startsWith("/contact-lists") ||
    location.pathname.startsWith("/campaigns-config");

  const isFlowbuilderRouteActive =
    location.pathname.startsWith("/phrase-lists") ||
    location.pathname.startsWith("/flowbuilders");

  useEffect(() => {
    if (location.pathname.startsWith("/tickets")) {
      setActiveMenu("/tickets");
    } else {
      setActiveMenu("");
    }
  }, [location, setActiveMenu]);

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
  }, []);

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
        if (data.action === "new-message" || data.action === "update") {
          dispatch({ type: "CHANGE_CHAT", payload: data });
        }
      };

      socket.on(`company-${companyId}-chat`, onCompanyChatMainListItems);
      return () => {
        socket.off(`company-${companyId}-chat`, onCompanyChatMainListItems);
      };
    }
  }, [socket, user.id]);

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
        const offlineWhats = whatsApps.filter((whats) =>
          ["qrcode", "PAIRING", "DISCONNECTED", "TIMEOUT", "OPENING"].includes(whats.status)
        );
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

  useEffect(() => {
    const checkSubscription = () => {
      if (!user?.company?.dueDate) {
        setIsSubscriptionValid(false);
        return;
      }
      
      // Company ID 1 is always valid (admin)
      if (user.company.id === 1) {
        setIsSubscriptionValid(true);
        return;
      }

      const dueDate = moment(user.company.dueDate);
      const today = moment();
      setIsSubscriptionValid(today.isBefore(dueDate));
    };

    checkSubscription();
  }, [user]);

  return (
    <div
      onClick={drawerClose}
      
    >
      

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1">
          {/* Management Section */}
          <Can
            role={
              (user.profile === "user" && user.showDashboard === "enabled") || user.allowRealTime === "enabled"
                ? "admin"
                : user.profile
            }
            perform={"drawer-admin-items:view"}
            yes={() => (
              <li className="mb-4">
                <div
                  className={`flex items-center justify-between px-3 py-2.5 mx-2 rounded-lg cursor-pointer transition-all duration-200 group ${
                    isManagementActive
                      ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25"
                      : "text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-white"
                  }`}
                  onClick={() => setOpenDashboardSubmenu((prev) => !prev)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200 ${
                        isManagementActive
                          ? "bg-white/20 text-white"
                          : "bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-300 group-hover:bg-gray-200 dark:group-hover:bg-gray-600 group-hover:text-blue-600 dark:group-hover:text-blue-400"
                      }`}
                    >
                      <LayoutGrid size={18} strokeWidth={2} />
                    </div>
                    {!collapsed && (
                      <span className="text-sm font-medium">{i18n.t("mainDrawer.listItems.management")}</span>
                    )}
                  </div>
                  {!collapsed && (
                    <div className="transition-transform duration-200">
                      {openDashboardSubmenu ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                  )}
                </div>
                <div
                  className={`transition-all duration-300 ease-in-out overflow-hidden ${
                    openDashboardSubmenu && !collapsed ? "max-h-96 opacity-100 mt-2" : "max-h-0 opacity-0"
                  }`}
                >
                  <div className="ml-4 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                    <ul className="space-y-1">
                      <Can
                        role={user.profile === "user" && user.showDashboard === "enabled" ? "admin" : user.profile}
                        perform={"drawer-admin-items:view"}
                        yes={() => (
                          <>
                            <ListItemLink to="/" primary="Dashboard" icon={<LayoutGrid />} tooltip={collapsed} />
                            <ListItemLink
                              to="/reports"
                              primary={i18n.t("mainDrawer.listItems.reports")}
                              icon={<BarChart3 />}
                              tooltip={collapsed}
                            />
                          </>
                        )}
                      />
                      <Can
                        role={user.profile === "user" && user.allowRealTime === "enabled" ? "admin" : user.profile}
                        perform={"drawer-admin-items:view"}
                        yes={() => (
                          <ListItemLink
                            to="/moments"
                            primary={i18n.t("mainDrawer.listItems.chatsTempoReal")}
                            icon={<Activity />}
                            tooltip={collapsed}
                          />
                        )}
                      />
                    </ul>
                  </div>
                </div>
              </li>
            )}
          />

          {/* Main Navigation Items */}
          <ListItemLink
            to="/tickets"
            primary={i18n.t("mainDrawer.listItems.tickets")}
            icon={<MessageSquareText />}
            tooltip={collapsed}
          />
          <ListItemLink
            to="/quick-messages"
            primary={i18n.t("mainDrawer.listItems.quickMessages")}
            icon={<Zap />}
            tooltip={collapsed}
          />
          {showKanban && (
            <ListItemLink
              to="/kanban"
              primary={i18n.t("mainDrawer.listItems.kanban")}
              icon={<Trello />}
              tooltip={collapsed}
            />
          )}
          <ListItemLink
            to="/contacts"
            primary={i18n.t("mainDrawer.listItems.contacts")}
            icon={<UserRound />}
            tooltip={collapsed}
          />
          {showSchedules && (
            <ListItemLink
              to="/schedules"
              primary={i18n.t("mainDrawer.listItems.schedules")}
              icon={<Clock3 />}
              tooltip={collapsed}
            />
          )}
          <ListItemLink
            to="/tags"
            primary={i18n.t("mainDrawer.listItems.tags")}
            icon={<Hash />}
            tooltip={collapsed}
          />
          {showInternalChat && (
            <ListItemLink
              to="/chats"
              primary={i18n.t("mainDrawer.listItems.chats")}
              icon={
                <div className="relative">
                  <MessagesSquare size={18} strokeWidth={2} />
                  {!invisible && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-gray-900"></span>
                  )}
                </div>
              }
              tooltip={collapsed}
            />
          )}
          <ListItemLink
            to="/helps"
            primary={i18n.t("mainDrawer.listItems.helps")}
            icon={<HelpCircle />}
            tooltip={collapsed}
          />
        </ul>

        {/* Administration Section */}
        <Can
          role={user.profile === "user" && user.allowConnections === "enabled" ? "admin" : user.profile}
          perform="dashboard:view"
          yes={() => (
            <div className="mt-8">
              {!collapsed && (
                <div className="px-6 mb-4">
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {i18n.t("mainDrawer.listItems.administration")}
                  </h3>
                </div>
              )}
              <ul className="space-y-1">
                {/* Campaigns */}
                {showCampaigns && (
                  <Can
                    role={user.profile}
                    perform="dashboard:view"
                    yes={() => (
                      <li className="mb-4">
                        <div
                          className={`flex items-center justify-between px-3 py-2.5 mx-2 rounded-lg cursor-pointer transition-all duration-200 group ${
                            isCampaignRouteActive
                              ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25"
                              : "text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-white"
                          }`}
                          onClick={() => setOpenCampaignSubmenu((prev) => !prev)}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200 ${
                                isCampaignRouteActive
                                  ? "bg-white/20 text-white"
                                  : "bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-300 group-hover:bg-gray-200 dark:group-hover:bg-gray-600 group-hover:text-blue-600 dark:group-hover:text-blue-400"
                              }`}
                            >
                              <Calendar size={18} strokeWidth={2} />
                            </div>
                            {!collapsed && (
                              <span className="text-sm font-medium">{i18n.t("mainDrawer.listItems.campaigns")}</span>
                            )}
                          </div>
                          {!collapsed && (
                            <div className="transition-transform duration-200">
                              {openCampaignSubmenu ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </div>
                          )}
                        </div>
                        <div
                          className={`transition-all duration-300 ease-in-out overflow-hidden ${
                            openCampaignSubmenu && !collapsed ? "max-h-96 opacity-100 mt-2" : "max-h-0 opacity-0"
                          }`}
                        >
                          <div className="ml-4 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                            <ul className="space-y-1">
                              <ListItemLink
                                to="/campaigns"
                                primary={i18n.t("campaigns.subMenus.list")}
                                icon={<List />}
                                tooltip={collapsed}
                              />
                              <ListItemLink
                                to="/contact-lists"
                                primary={i18n.t("campaigns.subMenus.listContacts")}
                                icon={<Users2 />}
                                tooltip={collapsed}
                              />
                              <ListItemLink
                                to="/campaigns-config"
                                primary={i18n.t("campaigns.subMenus.settings")}
                                icon={<Settings2 />}
                                tooltip={collapsed}
                              />
                            </ul>
                          </div>
                        </div>
                      </li>
                    )}
                  />
                )}

                {/* Flowbuilder */}
                <Can
                  role={user.profile}
                  perform="dashboard:view"
                  yes={() => (
                    <li className="mb-4">
                      <div
                        className={`flex items-center justify-between px-3 py-2.5 mx-2 rounded-lg cursor-pointer transition-all duration-200 group ${
                          isFlowbuilderRouteActive
                            ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25"
                            : "text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-white"
                        }`}
                        onClick={() => setOpenFlowSubmenu((prev) => !prev)}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200 ${
                              isFlowbuilderRouteActive
                                ? "bg-white/20 text-white"
                                : "bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-300 group-hover:bg-gray-200 dark:group-hover:bg-gray-600 group-hover:text-blue-600 dark:group-hover:text-blue-400"
                            }`}
                          >
                            <Webhook size={18} strokeWidth={2} />
                          </div>
                          {!collapsed && (
                            <span className="text-sm font-medium">{i18n.t("Flowbuilder")}</span>
                          )}
                        </div>
                        {!collapsed && (
                          <div className="transition-transform duration-200">
                            {openFlowSubmenu ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </div>
                        )}
                      </div>
                      <div
                        className={`transition-all duration-300 ease-in-out overflow-hidden ${
                          openFlowSubmenu && !collapsed ? "max-h-96 opacity-100 mt-2" : "max-h-0 opacity-0"
                        }`}
                      >
                        <div className="ml-4 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                          <ul className="space-y-1">
                            <ListItemLink
                              to="/phrase-lists"
                              primary={"Fluxo de Campanha"}
                              icon={<Calendar />}
                              tooltip={collapsed}
                            />
                            <ListItemLink
                              to="/flowbuilders"
                              primary={'Fluxo de conversa'}
                              icon={<Shapes />}
                              tooltip={collapsed}
                            />
                          </ul>
                        </div>
                      </div>
                    </li>
                  )}
                />

                {/* Other Admin Items */}
                {user.super && (
                  <ListItemLink
                    to="/announcements"
                    primary={i18n.t("mainDrawer.listItems.annoucements")}
                    icon={<Megaphone />}
                    tooltip={collapsed}
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
                        icon={<Code2 />}
                        tooltip={collapsed}
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
                      icon={<Users2 />}
                      tooltip={collapsed}
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
                      icon={<GitBranch />}
                      tooltip={collapsed}
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
                        icon={<Bot />}
                        tooltip={collapsed}
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
                        icon={<Network />}
                        tooltip={collapsed}
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
                      icon={<Phone />}
                      showBadge={connectionWarning}
                      tooltip={collapsed}
                    />
                  )}
                />
                {user.super && (
                  <ListItemLink
                    to="/allConnections"
                    primary={i18n.t("mainDrawer.listItems.allConnections")}
                    icon={<Smartphone />}
                    tooltip={collapsed}
                  />
                )}
                <Can
                  role={user.profile}
                  perform="dashboard:view"
                  yes={() => (
                    <ListItemLink
                      to="/files"
                      primary={i18n.t("mainDrawer.listItems.files")}
                      icon={<Paperclip />}
                      tooltip={collapsed}
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
                      icon={<CreditCard />}
                      tooltip={collapsed}
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
                      icon={<Settings2 />}
                      tooltip={collapsed}
                    />
                  )}
                />
                {user.super && (
                  <ListItemLink
                    to="/companies"
                    primary={i18n.t("mainDrawer.listItems.companies")}
                    icon={<Building2 />}
                    tooltip={collapsed}
                  />
                )}
              </ul>
            </div>
          )}
        />
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-center">
            <div className="px-3 py-1 bg-gray-100 dark:bg-gray-700/50 rounded-full">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">v.9.1.0</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainListItems;