import React, { useContext, useEffect, useReducer, useState } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import useHelps from "../hooks/useHelps";
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import ListSubheader from "@material-ui/core/ListSubheader";
import Divider from "@material-ui/core/Divider";
import Avatar from "@material-ui/core/Avatar";
import Badge from "@material-ui/core/Badge";
import Collapse from "@material-ui/core/Collapse";
import List from "@material-ui/core/List";
import Tooltip from "@material-ui/core/Tooltip";
import Typography from "@material-ui/core/Typography";

// Import Lucide React icons
import {
  LayoutDashboard,
  MessageSquare,
  Zap,
  Settings,
  Users,
  Contact,
  GitFork,
  HelpCircle,
  FileCode,
  KanbanSquare,
  Clock,
  Tag,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  List as ListIcon,
  UserRound,
  Calendar,
  Webhook,
  ShapesIcon,
  Megaphone,
  Smartphone,
  Paperclip,
  Wallet,
  Building,
  RefreshCw,
  Infinity,
  Network,
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

const useStyles = makeStyles((theme) => ({
  listItem: {
    height: "44px",
    width: "auto",
    borderRadius: "8px",
    margin: "4px 8px",
    "&:hover $iconHoverActive": {
      backgroundColor: theme.palette.primary.main,
      color: "#fff",
    },
  },

  listItemText: {
    fontSize: "14px",
    fontWeight: 500,
    color: theme.mode === "light" ? "#666" : "#FFF",
  },
  avatarActive: {
    backgroundColor: "transparent",
  },
  avatarHover: {
    backgroundColor: "transparent",
  },
  iconHoverActive: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: "50%",
    height: 36,
    width: 36,
    backgroundColor: theme.mode === "light" ? "rgba(120,120,120,0.1)" : "rgba(120,120,120,0.5)",
    color: theme.mode === "light" ? "#666" : "#FFF",
    transition: "background-color 0.2s ease, color 0.2s ease",
    "&:hover, &.active": {
      backgroundColor: theme.palette.primary.main,
      color: "#fff",
    },
    "& svg": {
      width: "20px",
      height: "20px",
    },
  },
  subMenuList: {
    borderRadius: "8px",
    margin: "0 8px",
  },
  subMenuItem: {
    borderRadius: "8px",
    padding: "4px 16px 4px 24px",
    margin: "2px 0",
  },
  version: {
    fontSize: "12px",
    padding: "10px",
    textAlign: "center",
    fontWeight: "bold",
    opacity: 0.7,
  },
}));

function ListItemLink(props) {
  const { icon, primary, to, tooltip, showBadge } = props;
  const classes = useStyles();
  const { activeMenu } = useActiveMenu();
  const location = useLocation();
  const isActive = activeMenu === to || location.pathname === to;

  const renderLink = React.useMemo(
    () => React.forwardRef((itemProps, ref) => <RouterLink to={to} ref={ref} {...itemProps} />),
    [to]
  );

  const ConditionalTooltip = ({ children, tooltipEnabled }) =>
    tooltipEnabled ? (
      <Tooltip title={primary} placement="right">
        {children}
      </Tooltip>
    ) : (
      children
    );

  return (
    <ConditionalTooltip tooltipEnabled={!!tooltip}>
      <li>
        <ListItem button component={renderLink} className={classes.listItem}>
          {icon ? (
            <ListItemIcon>
              {showBadge ? (
                <Badge badgeContent="!" color="error" overlap="circular" className={classes.badge}>
                  <Avatar className={`${classes.iconHoverActive} ${isActive ? "active" : ""}`}>{icon}</Avatar>
                </Badge>
              ) : (
                <Avatar className={`${classes.iconHoverActive} ${isActive ? "active" : ""}`}>{icon}</Avatar>
              )}
            </ListItemIcon>
          ) : null}
          <ListItemText primary={<Typography className={classes.listItemText}>{primary}</Typography>} />
        </ListItem>
      </li>
    </ConditionalTooltip>
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
  const theme = useTheme();
  const classes = useStyles();
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

  // novas features
  const [showSchedules, setShowSchedules] = useState(false);
  const [showInternalChat, setShowInternalChat] = useState(false);
  const [showExternalApi, setShowExternalApi] = useState(false);

  const [invisible, setInvisible] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);
  const [searchParam] = useState("");
  const [chats, dispatch] = useReducer(reducer, []);
  const [version, setVersion] = useState(false);
  const [managementHover, setManagementHover] = useState(false);
  const [campaignHover, setCampaignHover] = useState(false);
  const [flowHover, setFlowHover] = useState(false);
  const { list } = useHelps();
  const [hasHelps, setHasHelps] = useState(false);

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

  const { getPlanCompany } = usePlans();

  const { getVersion } = useVersion();

  useEffect(() => {
    async function fetchVersion() {
      const _version = await getVersion();
      setVersion(_version.version);
    }
    fetchVersion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchChats();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (unreadsCount > 0) {
      setInvisible(false);
    } else {
      setInvisible(true);
    }
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
        if (offlineWhats.length > 0) {
          setConnectionWarning(true);
        } else {
          setConnectionWarning(false);
        }
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
    <div onClick={drawerClose}>
      <Can
        role={
          (user.profile === "user" && user.showDashboard === "enabled") || user.allowRealTime === "enabled"
            ? "admin"
            : user.profile
        }
        perform={"drawer-admin-items:view"}
        yes={() => (
          <>
            <Tooltip title={collapsed ? i18n.t("mainDrawer.listItems.management") : ""} placement="right">
              <ListItem
                dense
                button
                className={classes.listItem}
                onClick={() => setOpenDashboardSubmenu((prev) => !prev)}
                onMouseEnter={() => setManagementHover(true)}
                onMouseLeave={() => setManagementHover(false)}
              >
                <ListItemIcon>
                  <Avatar
                    className={`${classes.iconHoverActive} ${isManagementActive || managementHover ? "active" : ""}`}
                  >
                    <LayoutDashboard />
                  </Avatar>
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography className={classes.listItemText}>
                      {i18n.t("mainDrawer.listItems.management")}
                    </Typography>
                  }
                />
                {openDashboardSubmenu ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </ListItem>
            </Tooltip>
            <Collapse
              in={openDashboardSubmenu}
              timeout="auto"
              unmountOnExit
              className={classes.subMenuList}
              style={{
                backgroundColor: theme.mode === "light" ? "rgba(120,120,120,0.1)" : "rgba(120,120,120,0.3)",
              }}
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
                    />
                    <ListItemLink
                      small
                      to="/reports"
                      primary={i18n.t("mainDrawer.listItems.reports")}
                      icon={<FileCode />}
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
                    icon={<KanbanSquare />}
                    tooltip={collapsed}
                  />
                )}
              />
            </Collapse>
          </>
        )}
      />
      <ListItemLink
        to="/tickets"
        primary={i18n.t("mainDrawer.listItems.tickets")}
        icon={<MessageSquare />}
        tooltip={collapsed}
      />

      <ListItemLink
        to="/quick-messages"
        primary={i18n.t("mainDrawer.listItems.quickMessages")}
        icon={<Zap />}
        tooltip={collapsed}
      />

      {showKanban && (
        <>
          <ListItemLink
            to="/kanban"
            primary={i18n.t("mainDrawer.listItems.kanban")}
            icon={<KanbanSquare />}
            tooltip={collapsed}
          />
        </>
      )}

      <ListItemLink
        to="/contacts"
        primary={i18n.t("mainDrawer.listItems.contacts")}
        icon={<Contact />}
        tooltip={collapsed}
      />

      {showSchedules && (
        <>
          <ListItemLink
            to="/schedules"
            primary={i18n.t("mainDrawer.listItems.schedules")}
            icon={<Clock />}
            tooltip={collapsed}
          />
        </>
      )}

      <ListItemLink
        to="/tags"
        primary={i18n.t("mainDrawer.listItems.tags")}
        icon={<Tag />}
        tooltip={collapsed}
      />

      {showInternalChat && (
        <>
          <ListItemLink
            to="/chats"
            primary={i18n.t("mainDrawer.listItems.chats")}
            icon={
              <Badge color="secondary" variant="dot" invisible={invisible}>
                <MessageCircle />
              </Badge>
            }
            tooltip={collapsed}
          />
        </>
      )}
      
      <ListItemLink
        to="/helps"
        primary={i18n.t("mainDrawer.listItems.helps")}
        icon={<HelpCircle />}
        tooltip={collapsed}
      />
      
      <Can
        role={user.profile === "user" && user.allowConnections === "enabled" ? "admin" : user.profile}
        perform="dashboard:view"
        yes={() => (
          <>
            <Divider style={{ margin: "8px 0" }} />
            <ListSubheader inset>{i18n.t("mainDrawer.listItems.administration")}</ListSubheader>
            {showCampaigns && (
              <Can
                role={user.profile}
                perform="dashboard:view"
                yes={() => (
                  <>
                    <Tooltip title={collapsed ? i18n.t("mainDrawer.listItems.campaigns") : ""} placement="right">
                      <ListItem
                        dense
                        button
                        className={classes.listItem}
                        onClick={() => setOpenCampaignSubmenu((prev) => !prev)}
                        onMouseEnter={() => setCampaignHover(true)}
                        onMouseLeave={() => setCampaignHover(false)}
                      >
                        <ListItemIcon>
                          <Avatar
                            className={`${classes.iconHoverActive} ${isCampaignRouteActive || campaignHover ? "active" : ""}`}
                          >
                            <Calendar />
                          </Avatar>
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Typography className={classes.listItemText}>
                              {i18n.t("mainDrawer.listItems.campaigns")}
                            </Typography>
                          }
                        />
                        {openCampaignSubmenu ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </ListItem>
                    </Tooltip>
                    <Collapse
                      in={openCampaignSubmenu}
                      timeout="auto"
                      unmountOnExit
                      className={classes.subMenuList}
                      style={{
                        backgroundColor: theme.mode === "light" ? "rgba(120,120,120,0.1)" : "rgba(120,120,120,0.3)",
                      }}
                    >
                      <List dense component="div" disablePadding>
                        <ListItemLink
                          to="/campaigns"
                          primary={i18n.t("campaigns.subMenus.list")}
                          icon={<ListIcon />}
                          tooltip={collapsed}
                        />
                        <ListItemLink
                          to="/contact-lists"
                          primary={i18n.t("campaigns.subMenus.listContacts")}
                          icon={<Users />}
                          tooltip={collapsed}
                        />
                        <ListItemLink
                          to="/campaigns-config"
                          primary={i18n.t("campaigns.subMenus.settings")}
                          icon={<Settings />}
                          tooltip={collapsed}
                        />
                      </List>
                    </Collapse>
                  </>
                )}
              />
            )}

            {/* FLOWBUILDER */}
            <Can
              role={user.profile}
              perform="dashboard:view"
              yes={() => (
                <>
                  <Tooltip title={collapsed ? i18n.t("Flowbuilder") : ""} placement="right">
                    <ListItem
                      dense
                      button
                      className={classes.listItem}
                      onClick={() => setOpenFlowSubmenu((prev) => !prev)}
                      onMouseEnter={() => setFlowHover(true)}
                      onMouseLeave={() => setFlowHover(false)}
                    >
                      <ListItemIcon>
                        <Avatar
                          className={`${classes.iconHoverActive} ${isFlowbuilderRouteActive || flowHover ? "active" : ""}`}
                        >
                          <Webhook />
                        </Avatar>
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Typography className={classes.listItemText}>
                            {i18n.t("Flowbuilder")}
                          </Typography>
                        }
                      />
                      {openFlowSubmenu ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </ListItem>
                  </Tooltip>

                  <Collapse
                    in={openFlowSubmenu}
                    timeout="auto"
                    unmountOnExit
                    className={classes.subMenuList}
                    style={{
                      backgroundColor: theme.mode === "light" ? "rgba(120,120,120,0.1)" : "rgba(120,120,120,0.3)",
                    }}
                  >
                    <List dense component="div" disablePadding>
                      <ListItemLink
                        to="/phrase-lists"
                        primary={"Fluxo de Campanha"}
                        icon={<Calendar />}
                        tooltip={collapsed}
                      />

                      <ListItemLink
                        to="/flowbuilders"
                        primary={'Fluxo de conversa'}
                        icon={<ShapesIcon />}
                        tooltip={collapsed}
                      />
                    </List>
                  </Collapse>
                </>
              )}
            />

            {user.super && (
              <ListItemLink
                to="/announcements"
                primary={i18n.t("mainDrawer.listItems.annoucements")}
                icon={<Megaphone />}
                tooltip={collapsed}
              />
            )}

            {showExternalApi && (
              <>
                <Can
                  role={user.profile}
                  perform="dashboard:view"
                  yes={() => (
                    <ListItemLink
                      to="/messages-api"
                      primary={i18n.t("mainDrawer.listItems.messagesAPI")}
                      icon={<FileCode />}
                      tooltip={collapsed}
                    />
                  )}
                />
              </>
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
                  icon={<GitFork />}
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
                    icon={<Infinity />}
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
                  icon={<RefreshCw />}
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
                  icon={<Wallet />}
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
                  icon={<Settings />}
                  tooltip={collapsed}
                />
              )}
            />

            {user.super && (
              <ListItemLink
                to="/companies"
                primary={i18n.t("mainDrawer.listItems.companies")}
                icon={<Building />}
                tooltip={collapsed}
              />
            )}
          </>
        )}
      />
      {!collapsed && (
        <React.Fragment>
          <Divider style={{ margin: "12px 0 4px" }} />
          <Typography className={classes.version}>
            {`v.9.1.0`}
          </Typography>
        </React.Fragment>
      )}
    </div>
  );
};

export default MainListItems;