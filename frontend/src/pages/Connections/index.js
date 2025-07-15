import React, { useState, useCallback, useContext, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { add, format, parseISO } from "date-fns";
import { useHistory } from "react-router-dom";
import { Facebook, Instagram, MessageSquare, QrCode, RefreshCw, Trash2, Settings, Plug, PlugZap, Cable, X, Phone, Plus, PlusCircle, AlertCircle } from "lucide-react";
import FacebookLogin from "react-facebook-login/dist/facebook-login-render-props";

// Material UI imports
import {
  Button,
  Card,
  CardContent,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  Tooltip,
  Typography,
  Box,
  Chip,
} from "@mui/material";

// Custom components
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import TableRowSkeleton from "../../components/TableRowSkeleton";
import WhatsAppModal from "../../components/WhatsAppModal";
import QrcodeModal from "../../components/QrcodeModal";
import ForbiddenPage from "../../components/ForbiddenPage";
import { Can } from "../../components/Can";

// Contexts and utils
import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import { WhatsAppsContext } from "../../context/WhatsApp/WhatsAppsContext";
import { AuthContext } from "../../context/Auth/AuthContext";
import toastError from "../../errors/toastError";
import formatSerializedId from '../../utils/formatSerializedId';
import usePlans from "../../hooks/usePlans";

const Connections = () => {
  const history = useHistory();
  const { whatsApps, loading } = useContext(WhatsAppsContext);
  const { user, socket } = useContext(AuthContext);
  const { getPlanCompany } = usePlans();

  // States
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const [statusImport, setStatusImport] = useState([]);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedWhatsApp, setSelectedWhatsApp] = useState(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [planConfig, setPlanConfig] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  
  const confirmationModalInitialState = {
    action: "",
    title: "",
    message: "",
    whatsAppId: "",
  };
  const [confirmModalInfo, setConfirmModalInfo] = useState(confirmationModalInitialState);

  const companyId = user?.companyId;
  const isMounted = useRef(true);

  // Handle menu open/close
  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    async function fetchData() {
      try {
        const planConfigs = await getPlanCompany(undefined, companyId);
        if (isActive && isMounted.current) {
          setPlanConfig(planConfigs);
        }
      } catch (err) {
        toastError(err);
      }
    }
    if (companyId) {
      fetchData();
    }
    return () => {
      isActive = false;
    };
  }, [companyId, getPlanCompany]);

  useEffect(() => {
    if (!socket || !companyId) return;

    const handleSocketEvent = (data) => {
      if (!isMounted.current) return;
      if (data.action === "refresh") {
        setStatusImport([]);
        history.go(0);
      }
      if (data.action === "update") {
        setStatusImport(data.status);
      }
    };

    socket.on(`importMessages-${companyId}`, handleSocketEvent);

    return () => {
      socket.off(`importMessages-${companyId}`, handleSocketEvent);
    };
  }, [socket, companyId, history]);

  const getChannelIcon = (channel) => {
    switch (channel) {
      case "facebook":
        return <Facebook size={20} color="#3b5998" />;
      case "instagram":
        return <Instagram size={20} color="#e1306c" />;
      case "whatsapp":
        return <MessageSquare size={20} color="#25d366" />;
      default:
        return <AlertCircle size={20} />;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "CONNECTED":
        return <PlugZap size={20} color="#4caf50" />;
      case "DISCONNECTED":
        return <Cable size={20} color="#f44336" />;
      case "PAIRING":
      case "TIMEOUT":
        return <Plug size={20} color="#ff9800" />;
      case "qrcode":
        return <QrCode size={20} color="#2196f3" />;
      case "OPENING":
        return <RefreshCw size={20} className="animate-spin" color="#9c27b0" />;
      default:
        return <AlertCircle size={20} />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case "CONNECTED":
        return i18n.t("connections.status.connected");
      case "DISCONNECTED":
        return i18n.t("connections.status.disconnected");
      case "PAIRING":
      case "TIMEOUT":
        return i18n.t("connections.status.pairing");
      case "qrcode":
        return i18n.t("connections.status.qrcode");
      case "OPENING":
        return i18n.t("connections.status.opening");
      default:
        return status;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "CONNECTED":
        return "#4caf50";
      case "DISCONNECTED":
        return "#f44336";
      case "PAIRING":
      case "TIMEOUT":
        return "#ff9800";
      case "qrcode":
        return "#2196f3";
      case "OPENING":
        return "#9c27b0";
      default:
        return "#9e9e9e";
    }
  };

  const responseFacebook = (response) => {
    if (response.status !== "unknown") {
      const { accessToken, id } = response;
      api
        .post("/facebook", {
          facebookUserId: id,
          facebookUserToken: accessToken,
        })
        .then(() => {
          toast.success(i18n.t("connections.facebook.success"));
        })
        .catch((error) => {
          toastError(error);
        });
    }
  };

  const responseInstagram = (response) => {
    if (response.status !== "unknown") {
      const { accessToken, id } = response;
      api
        .post("/facebook", {
          addInstagram: true,
          facebookUserId: id,
          facebookUserToken: accessToken,
        })
        .then(() => {
          toast.success(i18n.t("connections.facebook.success"));
        })
        .catch((error) => {
          toastError(error);
        });
    }
  };

  const handleStartWhatsAppSession = async (whatsAppId) => {
    try {
      await api.post(`/whatsappsession/${whatsAppId}`);
    } catch (err) {
      toastError(err);
    }
  };

  const handleRequestNewQrCode = async (whatsAppId) => {
    try {
      await api.put(`/whatsappsession/${whatsAppId}`);
    } catch (err) {
      toastError(err);
    }
  };

  const handleOpenWhatsAppModal = () => {
    setSelectedWhatsApp(null);
    setWhatsAppModalOpen(true);
    handleMenuClose();
  };

  const handleCloseWhatsAppModal = useCallback(() => {
    setWhatsAppModalOpen(false);
    setSelectedWhatsApp(null);
  }, []);

  const handleOpenQrModal = (whatsApp) => {
    setSelectedWhatsApp(whatsApp);
    setQrModalOpen(true);
  };

  const handleCloseQrModal = useCallback(() => {
    setSelectedWhatsApp(null);
    setQrModalOpen(false);
  }, []);

  const handleEditWhatsApp = (whatsApp) => {
    setSelectedWhatsApp(whatsApp);
    setWhatsAppModalOpen(true);
  };

  const openInNewTab = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleOpenConfirmationModal = (action, whatsAppId) => {
    if (action === "disconnect") {
      setConfirmModalInfo({
        action,
        title: i18n.t("connections.confirmationModal.disconnectTitle"),
        message: i18n.t("connections.confirmationModal.disconnectMessage"),
        whatsAppId,
      });
    } else if (action === "delete") {
      setConfirmModalInfo({
        action,
        title: i18n.t("connections.confirmationModal.deleteTitle"),
        message: i18n.t("connections.confirmationModal.deleteMessage"),
        whatsAppId,
      });
    } else if (action === "closedImported") {
      setConfirmModalInfo({
        action,
        title: i18n.t("connections.confirmationModal.closedImportedTitle"),
        message: i18n.t("connections.confirmationModal.closedImportedMessage"),
        whatsAppId,
      });
    }
    setConfirmModalOpen(true);
  };

  const handleSubmitConfirmationModal = async () => {
    if (confirmModalInfo.action === "disconnect") {
      try {
        await api.delete(`/whatsappsession/${confirmModalInfo.whatsAppId}`);
      } catch (err) {
        toastError(err);
      }
    } else if (confirmModalInfo.action === "delete") {
      try {
        await api.delete(`/whatsapp/${confirmModalInfo.whatsAppId}`);
        toast.success(i18n.t("connections.toasts.deleted"));
      } catch (err) {
        toastError(err);
      }
    } else if (confirmModalInfo.action === "closedImported") {
      try {
        await api.post(`/closedimported/${confirmModalInfo.whatsAppId}`);
        toast.success(i18n.t("connections.toasts.closedimported"));
      } catch (err) {
        toastError(err);
      }
    }
    setConfirmModalInfo(confirmationModalInitialState);
    setConfirmModalOpen(false);
  };

  const renderImportButton = (whatsApp) => {
    if (!whatsApp) return null;
    if (whatsApp?.statusImportMessages === "renderButtonCloseTickets") {
      return (
        <Button
          size="small"
          variant="outlined"
          sx={{ ml: 1 }}
          onClick={() => handleOpenConfirmationModal("closedImported", whatsApp.id)}
        >
          {i18n.t("connections.buttons.closedImported")}
        </Button>
      );
    }

    if (whatsApp?.importOldMessages) {
      let isTimeStamp = !isNaN(new Date(Math.floor(whatsApp?.statusImportMessages)).getTime());
      if (isTimeStamp) {
        const ultimoStatus = new Date(Math.floor(whatsApp?.statusImportMessages)).getTime();
        const dataLimite = +add(ultimoStatus, { seconds: +35 }).getTime();
        if (dataLimite > new Date().getTime()) {
          return (
            <Button
              disabled
              size="small"
              variant="outlined"
              sx={{ ml: 1 }}
              startIcon={<RefreshCw size={16} className="animate-spin" />}
            >
              {i18n.t("connections.buttons.preparing")}
            </Button>
          );
        }
      }
    }
    return null;
  };

  const renderActionButtons = (whatsApp) => {
    if (!whatsApp) return null;
    return (
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        {whatsApp.status === "qrcode" && (
          <Can
            role={user?.profile === "user" && user?.allowConnections === "enabled" ? "admin" : user?.profile}
            perform="connections-page:addConnection"
            yes={() => (
              <Button
                size="small"
                variant="contained"
                color="primary"
                startIcon={<QrCode size={16} />}
                onClick={() => handleOpenQrModal(whatsApp)}
              >
                {i18n.t("connections.buttons.qrcode")}
              </Button>
            )}
          />
        )}
        {whatsApp.status === "DISCONNECTED" && (
          <Can
            role={user?.profile === "user" && user?.allowConnections === "enabled" ? "admin" : user?.profile}
            perform="connections-page:addConnection"
            yes={() => (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  color="primary"
                  startIcon={<RefreshCw size={16} />}
                  onClick={() => handleStartWhatsAppSession(whatsApp.id)}
                >
                  {i18n.t("connections.buttons.tryAgain")}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="secondary"
                  startIcon={<QrCode size={16} />}
                  onClick={() => handleRequestNewQrCode(whatsApp.id)}
                >
                  {i18n.t("connections.buttons.newQr")}
                </Button>
              </Box>
            )}
          />
        )}
        {(whatsApp.status === "CONNECTED" || whatsApp.status === "PAIRING" || whatsApp.status === "TIMEOUT") && (
          <Can
            role={user?.profile}
            perform="connections-page:addConnection"
            yes={() => (
              <Box sx={{ display: 'flex', gap: 1 }}>
                {whatsApp.channel === "whatsapp" && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<X size={16} />}
                    onClick={() => handleOpenConfirmationModal("disconnect", whatsApp.id)}
                  >
                    {i18n.t("connections.buttons.disconnect")}
                  </Button>
                )}
                {renderImportButton(whatsApp)}
              </Box>
            )}
          />
        )}
        {whatsApp.status === "OPENING" && (
          <Button size="small" variant="outlined" disabled startIcon={<RefreshCw size={16} className="animate-spin" />}>
            {i18n.t("connections.buttons.connecting")}
          </Button>
        )}
      </Box>
    );
  };

  const restartWhatsapps = async () => {
    try {
      await api.post(`/whatsapp-restart/`);
      toast.success(i18n.t("connections.waitConnection"));
    } catch (err) {
      toastError(err);
    }
  };

  if (!user || loading) {
    return <TableRowSkeleton />;
  }
  
  return (
    <MainContainer>
      {/* Confirmation Dialog */}
      <Dialog 
        open={confirmModalOpen} 
        onClose={() => setConfirmModalOpen(false)}
        PaperProps={{ 
          elevation: 2, 
          sx: { borderRadius: 2, p: 1 } 
        }}
      >
        <DialogTitle>{confirmModalInfo.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{confirmModalInfo.message}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmModalOpen(false)} color="primary">
            {i18n.t("connections.buttons.cancel")}
          </Button>
          <Button onClick={handleSubmitConfirmationModal} color="primary" variant="contained">
            {i18n.t("connections.buttons.confirm")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* QR Code Modal */}
      {qrModalOpen && (
        <QrcodeModal
          open={qrModalOpen}
          onClose={handleCloseQrModal}
          whatsAppId={!whatsAppModalOpen && selectedWhatsApp?.id}
        />
      )}

      {/* WhatsApp Modal */}
      <WhatsAppModal
        open={whatsAppModalOpen}
        onClose={handleCloseWhatsAppModal}
        whatsAppId={!qrModalOpen && selectedWhatsApp?.id}
      />

      {user.profile === "user" && user.allowConnections === "disabled" ? (
        <ForbiddenPage />
      ) : (
        <Container maxWidth="lg" sx={{ py: 3 }}>
          <MainHeader>
            <Typography variant="h5" component="h1" fontWeight="500">
              {i18n.t("connections.title")} ({whatsApps.length})
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                color="primary"
                onClick={restartWhatsapps}
                startIcon={<RefreshCw size={18} />}
              >
                {i18n.t("connections.restartConnections")}
              </Button>

              <Button
                variant="outlined"
                color="primary"
                onClick={() => openInNewTab(`https://wa.me/${process.env.REACT_APP_NUMBER_SUPPORT}`)}
                startIcon={<Phone size={18} />}
              >
                {i18n.t("connections.callSupport")}
              </Button>
              
              <Can
                role={user.profile === "user" && user.allowConnections === "enabled" ? "admin" : user.profile}
                perform="connections-page:addConnection"
                yes={() => (
                  <>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleMenuOpen}
                      startIcon={<Plus size={18} />}
                    >
                      {i18n.t("connections.newConnection")}
                    </Button>
                    <Menu
                      anchorEl={anchorEl}
                      open={Boolean(anchorEl)}
                      onClose={handleMenuClose}
                      PaperProps={{ 
                        elevation: 2, 
                        sx: { borderRadius: 1, mt: 1 } 
                      }}
                    >
                      {/* WHATSAPP */}
                      <MenuItem
                        disabled={planConfig?.plan?.useWhatsapp ? false : true}
                        onClick={handleOpenWhatsAppModal}
                        sx={{ gap: 1 }}
                      >
                        <MessageSquare size={20} color="#25D366" />
                        WhatsApp
                      </MenuItem>
                      
                      {/* FACEBOOK */}
                      <FacebookLogin
                        appId={process.env.REACT_APP_FACEBOOK_APP_ID}
                        autoLoad={false}
                        fields="name,email,picture"
                        version="9.0"
                        scope="public_profile,pages_messaging,pages_show_list,pages_manage_metadata,pages_read_engagement,business_management"
                        callback={responseFacebook}
                        render={(renderProps) => (
                          <MenuItem
                            disabled={planConfig?.plan?.useFacebook ? false : true}
                            onClick={renderProps.onClick}
                            sx={{ gap: 1 }}
                          >
                            <Facebook size={20} color="#3b5998" />
                            Facebook
                          </MenuItem>
                        )}
                      />
                      
                      {/* INSTAGRAM */}
                      <FacebookLogin
                        appId={process.env.REACT_APP_FACEBOOK_APP_ID}
                        autoLoad={false}
                        fields="name,email,picture"
                        version="9.0"
                        scope="public_profile,instagram_basic,instagram_manage_messages,pages_messaging,pages_show_list,pages_manage_metadata,pages_read_engagement,business_management"
                        callback={responseInstagram}
                        render={(renderProps) => (
                          <MenuItem
                            disabled={planConfig?.plan?.useInstagram ? false : true}
                            onClick={renderProps.onClick}
                            sx={{ gap: 1 }}
                          >
                            <Instagram size={20} color="#e1306c" />
                            Instagram
                          </MenuItem>
                        )}
                      />
                    </Menu>
                  </>
                )}
              />
            </Box>
          </MainHeader>

          {/* Import Status Card */}
          {statusImport?.all && (
            <Card 
              elevation={0} 
              variant="outlined" 
              sx={{ 
                mb: 3, 
                borderRadius: 2, 
                overflow: 'hidden',
                border: '1px solid #e0e0e0'
              }}
            >
              <CardContent sx={{ pb: 2 }}>
                <Typography variant="h6" gutterBottom>
                  {statusImport?.this === -1 
                    ? i18n.t("connections.buttons.preparing") 
                    : i18n.t("connections.buttons.importing")
                  }
                </Typography>
                
                {statusImport?.this === -1 ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <RefreshCw size={24} className="animate-spin" />
                  </Box>
                ) : (
                  <>
                    <Typography variant="body2" color="textSecondary" gutterBottom align="center">
                      {`${i18n.t(`connections.typography.processed`)} ${statusImport?.this} ${i18n.t(`connections.typography.in`)} ${statusImport?.all}  ${i18n.t(`connections.typography.date`)}: ${statusImport?.date} `}
                    </Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={(statusImport?.this / statusImport?.all) * 100}
                      sx={{ 
                        height: 8, 
                        borderRadius: 4,
                        my: 1
                      }}
                    />
                    <Typography variant="body2" color="textSecondary" align="right">
                      {`${Math.round((statusImport?.this / statusImport?.all) * 100)}%`}
                    </Typography>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Connection Cards */}
          <Grid container spacing={2}>
            {loading ? (
              <Grid item xs={12}>
                <TableRowSkeleton />
              </Grid>
            ) : (
              <>
                {whatsApps?.length > 0 ? (
                  whatsApps.map((whatsApp) => (
                    <Grid item xs={12} sm={6} md={4} key={whatsApp.id}>
                      <Card 
                        elevation={0} 
                        variant="outlined" 
                        sx={{ 
                          height: '100%', 
                          display: 'flex', 
                          flexDirection: 'column',
                          borderRadius: 2,
                          transition: 'all 0.2s ease-in-out',
                          '&:hover': {
                            boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                          }
                        }}
                      >
                        <CardContent sx={{ flexGrow: 1, pb: 1 }}>
                          <Box sx={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            mb: 2,
                            alignItems: 'center'
                          }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {getChannelIcon(whatsApp.channel)}
                              <Typography variant="subtitle1" fontWeight="500">
                                {whatsApp.name}
                              </Typography>
                            </Box>
                            
                            <Box>
                              {whatsApp.isDefault && (
                                <Chip 
                                  label={i18n.t("connections.default")} 
                                  size="small" 
                                  color="primary" 
                                  variant="outlined"
                                />
                              )}
                            </Box>
                          </Box>
                          
                          <Divider sx={{ mb: 2 }} />
                          
                          <Box sx={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: 1.5,
                            mb: 2
                          }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" color="textSecondary">
                                {i18n.t("connections.table.number")}:
                              </Typography>
                              <Typography variant="body2">
                                {whatsApp.number && whatsApp.channel === 'whatsapp' 
                                  ? formatSerializedId(whatsApp.number)
                                  : whatsApp.number
                                }
                              </Typography>
                            </Box>
                            
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" color="textSecondary">
                                {i18n.t("connections.table.status")}:
                              </Typography>
                              <Box sx={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 0.5,
                                borderRadius: 1,
                                px: 1,
                                py: 0.5,
                                backgroundColor: `${getStatusColor(whatsApp.status)}15`
                              }}>
                                {getStatusIcon(whatsApp.status)}
                                <Typography variant="body2" sx={{ color: getStatusColor(whatsApp.status) }}>
                                  {getStatusText(whatsApp.status)}
                                </Typography>
                              </Box>
                            </Box>
                            
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" color="textSecondary">
                                {i18n.t("connections.table.lastUpdate")}:
                              </Typography>
                              <Typography variant="body2">
                                {format(parseISO(whatsApp.updatedAt), "dd/MM/yy HH:mm")}
                              </Typography>
                            </Box>
                          </Box>
                        </CardContent>
                        
                        <Divider />
                        
                        <Box sx={{ 
                          p: 2, 
                          display: 'flex', 
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          {renderActionButtons(whatsApp)}
                          
                          <Can
                            role={user.profile}
                            perform="connections-page:addConnection"
                            yes={() => (
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                <Tooltip title={i18n.t("connections.edit")}>
                                  <IconButton 
                                    size="small"
                                    onClick={() => handleEditWhatsApp(whatsApp)}
                                  >
                                    <Settings size={20} />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title={i18n.t("connections.delete")}>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleOpenConfirmationModal("delete", whatsApp.id)}
                                  >
                                    <Trash2 size={20} />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            )}
                          />
                        </Box>
                      </Card>
                    </Grid>
                  ))
                ) : (
                  <Grid item xs={12}>
                    <Paper 
                      variant="outlined" 
                      sx={{ 
                        p: 4, 
                        textAlign: 'center',
                        borderRadius: 2
                      }}
                    >
                      <Box sx={{ mb: 2 }}>
                        <PlusCircle size={48} color="#9e9e9e" />
                      </Box>
                      <Typography variant="h6" gutterBottom>
                        {i18n.t("connections.noConnections")}
                      </Typography>
                      <Typography variant="body2" color="textSecondary" gutterBottom>
                        {i18n.t("connections.addYourFirst")}
                      </Typography>
                      <Button
                        variant="contained"
                        color="primary"
                        sx={{ mt: 2 }}
                        startIcon={<Plus size={18} />}
                        onClick={handleMenuOpen}
                      >
                        {i18n.t("connections.newConnection")}
                      </Button>
                    </Paper>
                  </Grid>
                )}
              </>
            )}
          </Grid>
        </Container>
      )}
    </MainContainer>
  );
};

export default Connections;