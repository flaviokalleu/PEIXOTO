import React, { useState, useEffect, useReducer, useContext, useRef } from "react";
import { toast } from "react-toastify";
import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import Paper from "@material-ui/core/Paper";
import Button from "@material-ui/core/Button";
import Avatar from "@material-ui/core/Avatar";
import { Facebook, Instagram, WhatsApp } from "@material-ui/icons";
import SearchIcon from "@material-ui/icons/Search";
import TextField from "@material-ui/core/TextField";
import InputAdornment from "@material-ui/core/InputAdornment";
import IconButton from "@material-ui/core/IconButton";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";
import EditIcon from "@material-ui/icons/Edit";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import CancelIcon from "@material-ui/icons/Cancel";
import BlockIcon from "@material-ui/icons/Block";
import { ArrowDropDown, Backup, ContactPhone } from "@material-ui/icons";
import { Menu, MenuItem } from "@material-ui/core";
import PopupState, { bindTrigger, bindMenu } from "material-ui-popup-state";
import { v4 as uuidv4 } from "uuid";
import api from "../../services/api";
import TableRowSkeleton from "../../components/TableRowSkeleton";
import ContactModal from "../../components/ContactModal";
import ConfirmationModal from "../../components/ConfirmationModal";
import ContactImportWpModal from "../../components/ContactImportWpModal";
import NewTicketModal from "../../components/NewTicketModal";
import { TagsFilter } from "../../components/TagsFilter";
import { i18n } from "../../translate/i18n";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import MainContainer from "../../components/MainContainer";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { Can } from "../../components/Can";
import { TicketsContext } from "../../context/Tickets/TicketsContext";
import useCompanySettings from "../../hooks/useSettings/companySettings";

// Phone number validation and formatting functions
const isValidBrazilianPhoneNumber = (number) => {
  if (!number) return false;
  const cleanNumber = number.replace(/\D/g, '');
  if (!cleanNumber || cleanNumber.length < 10) return false;
  if (cleanNumber.length > 13) return false;
  const hasBrazilCountryCode = cleanNumber.startsWith('55');
  const numberWithoutCountryCode = hasBrazilCountryCode ? cleanNumber.slice(2) : cleanNumber;
  const areaCode = numberWithoutCountryCode.slice(0, 2);
  const areaCodeNum = parseInt(areaCode, 10);
  if (areaCodeNum < 11 || areaCodeNum > 99) return false;
  const phoneNumberWithoutAreaCode = numberWithoutCountryCode.slice(2);
  const isValidLength = phoneNumberWithoutAreaCode.length === 8 || phoneNumberWithoutAreaCode.length === 9;
  const isMobileValid = phoneNumberWithoutAreaCode.length === 9 && phoneNumberWithoutAreaCode.startsWith('9');
  const isLandlineValid = phoneNumberWithoutAreaCode.length === 8;
  return isValidLength && (isMobileValid || isLandlineValid);
};

const formatBrazilianPhoneNumber = (number) => {
  if (!isValidBrazilianPhoneNumber(number)) return null;
  const cleanNumber = number.replace(/\D/g, '');
  const hasBrazilCountryCode = cleanNumber.startsWith('55');
  const numberWithoutCountryCode = hasBrazilCountryCode ? cleanNumber.slice(2) : cleanNumber;
  const areaCode = numberWithoutCountryCode.slice(0, 2);
  const phoneNumber = numberWithoutCountryCode.slice(2);
  if (phoneNumber.length === 9) {
    return `🇧🇷 (${areaCode}) ${phoneNumber.slice(0, 1)}${phoneNumber.slice(1, 5)}-${phoneNumber.slice(5)}`;
  } else {
    return `🇧🇷 (${areaCode}) ${phoneNumber.slice(0, 4)}-${phoneNumber.slice(4)}`;
  }
};

const formatPhoneNumber = (number, isGroup, shouldHide = false, userProfile = "") => {
  if (isGroup) return number;
  const isValidBrNumber = isValidBrazilianPhoneNumber(number);
  if (!isValidBrNumber) return null;
  if (shouldHide && userProfile === "user") {
    const formattedNumber = formatBrazilianPhoneNumber(number);
    if (!formattedNumber) return null;
    const parts = formattedNumber.split(' ');
    if (parts.length >= 3) {
      const lastPart = parts[parts.length - 1];
      const [firstHalf, secondHalf] = lastPart.split('-');
      return `🇧🇷 ${parts[1]} ${firstHalf.slice(0, -2)}**-**${secondHalf.slice(-2)}`;
    }
    return formattedNumber;
  }
  return formatBrazilianPhoneNumber(number) || null;
};

const reducer = (state, action) => {
  if (action.type === "LOAD_CONTACTS") {
    const contacts = action.payload;
    const newContacts = [];
    contacts.forEach((contact) => {
      const contactIndex = state.findIndex((c) => c.id === contact.id);
      if (contactIndex !== -1) {
        state[contactIndex] = contact;
      } else {
        newContacts.push(contact);
      }
    });
    return [...state, ...newContacts];
  }
  if (action.type === "UPDATE_CONTACTS") {
    const contact = action.payload;
    const contactIndex = state.findIndex((c) => c.id === contact.id);
    if (contactIndex !== -1) {
      state[contactIndex] = contact;
      return [...state];
    } else {
      return [contact, ...state];
    }
  }
  if (action.type === "DELETE_CONTACT") {
    const contactId = action.payload;
    const contactIndex = state.findIndex((c) => c.id === contactId);
    if (contactIndex !== -1) {
      state.splice(contactIndex, 1);
    }
    return [...state];
  }
  if (action.type === "RESET") {
    return [];
  }
};

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(1),
    overflowY: "scroll",
    ...theme.scrollbarStyles,
  },
}));

const Contacts = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user, socket } = useContext(AuthContext);
  const { setCurrentTicket } = useContext(TicketsContext);
  const { getAll: getAllSettings } = useCompanySettings();

  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [searchParam, setSearchParam] = useState("");
  const [contacts, dispatch] = useReducer(reducer, []);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [importContactModalOpen, setImportContactModalOpen] = useState(false);
  const [deletingContact, setDeletingContact] = useState(null);
  const [ImportContacts, setImportContacts] = useState(null);
  const [blockingContact, setBlockingContact] = useState(null);
  const [unBlockingContact, setUnBlockingContact] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [exportContact, setExportContact] = useState(false);
  const [confirmChatsOpen, setConfirmChatsOpen] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [contactTicket, setContactTicket] = useState({});
  const [selectedTags, setSelectedTags] = useState([]);
  const [hideNum, setHideNum] = useState(false);
  const [enableLGPD, setEnableLGPD] = useState(false);
  const fileUploadRef = useRef(null);

  useEffect(() => {
    async function fetchData() {
      const settingList = await getAllSettings(user.companyId);
      for (const [key, value] of Object.entries(settingList)) {
        if (key === "enableLGPD") setEnableLGPD(value === "enabled");
        if (key === "lgpdHideNumber") setHideNum(value === "enabled");
      }
    }
    fetchData();
  }, [user.companyId, getAllSettings]);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [searchParam, selectedTags]);

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      const fetchContacts = async () => {
        try {
          const { data } = await api.get("/contacts/", {
            params: { searchParam, pageNumber, contactTag: JSON.stringify(selectedTags) },
          });
          dispatch({ type: "LOAD_CONTACTS", payload: data.contacts });
          setHasMore(data.hasMore);
          setLoading(false);
        } catch (err) {
          toastError(err);
        }
      };
      fetchContacts();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchParam, pageNumber, selectedTags]);

  useEffect(() => {
    const companyId = user.companyId;
    const onContactEvent = (data) => {
      if (data.action === "update" || data.action === "create") {
        dispatch({ type: "UPDATE_CONTACTS", payload: data.contact });
      }
      if (data.action === "delete") {
        dispatch({ type: "DELETE_CONTACT", payload: +data.contactId });
      }
    };
    socket.on(`company-${companyId}-contact`, onContactEvent);
    return () => {
      socket.off(`company-${companyId}-contact`, onContactEvent);
    };
  }, [socket, user.companyId]);

  const handleSelectTicket = (ticket) => {
    const code = uuidv4();
    const { id, uuid } = ticket;
    setCurrentTicket({ id, uuid, code });
  };

  const handleCloseOrOpenTicket = (ticket) => {
    setNewTicketModalOpen(false);
    if (ticket !== undefined && ticket.uuid !== undefined) {
      handleSelectTicket(ticket);
      history.push(`/tickets/${ticket.uuid}`);
    }
  };

  const handleSelectedTags = (selecteds) => {
    const tags = selecteds.map((t) => t.id);
    setSelectedTags(tags);
  };

  const handleSearch = (event) => {
    setSearchParam(event.target.value.toLowerCase());
  };

  const handleOpenContactModal = () => {
    setSelectedContactId(null);
    setContactModalOpen(true);
  };

  const handleCloseContactModal = () => {
    setSelectedContactId(null);
    setContactModalOpen(false);
  };

  const hadleEditContact = (contactId) => {
    setSelectedContactId(contactId);
    setContactModalOpen(true);
  };

  const handleDeleteContact = async (contactId) => {
    try {
      await api.delete(`/contacts/${contactId}`);
      toast.success(i18n.t("contacts.toasts.deleted"));
    } catch (err) {
      toastError(err);
    }
    setDeletingContact(null);
    setSearchParam("");
    setPageNumber(1);
  };

  const handleBlockContact = async (contactId) => {
    try {
      await api.put(`/contacts/block/${contactId}`, { active: false });
      toast.success("Contato bloqueado");
    } catch (err) {
      toastError(err);
    }
    setBlockingContact(null);
    setSearchParam("");
    setPageNumber(1);
  };

  const handleUnBlockContact = async (contactId) => {
    try {
      await api.put(`/contacts/block/${contactId}`, { active: true });
      toast.success("Contato desbloqueado");
    } catch (err) {
      toastError(err);
    }
    setUnBlockingContact(null);
    setSearchParam("");
    setPageNumber(1);
  };

  const handleImportExcel = async () => {
    try {
      const formData = new FormData();
      formData.append("file", fileUploadRef.current.files[0]);
      await api.request({
        url: `/contacts/upload`,
        method: "POST",
        data: formData,
      });
      history.go(0);
    } catch (err) {
      toastError(err);
    }
  };

  const handleImportContact = async () => {
    try {
      await api.post("/contacts/import");
      history.go(0);
      setImportContacts(false);
    } catch (err) {
      toastError(err);
      setImportContacts(false);
    }
  };

  const handleImportChats = async () => {
    try {
      await api.post("/contacts/import/chats");
      history.go(0);
    } catch (err) {
      toastError(err);
    }
  };

  const handleSaveTicket = async (contactId) => {
    if (!contactId) return;
    setLoading(true);
    try {
      const { data: contact } = await api.get(`/contacts/${contactId}`);
      if (contact.number) {
        const { data: ticket } = await api.post("/tickets", {
          contactId: contactId,
          userId: user?.id,
          status: "open",
        });
        handleSelectTicket(ticket);
        history.push(`/tickets/${ticket.id}`);
      } else if (!contact.number && contact.instagramId && !contact.messengerId) {
        const { data: ticket } = await api.post("/hub-ticket", {
          contactId: contactId,
          userId: user?.id,
          status: "open",
          channel: "instagram",
        });
        handleSelectTicket(ticket);
        history.push(`/tickets/${ticket.id}`);
      } else if (!contact.number && contact.messengerId && !contact.instagramId) {
        const { data: ticket } = await api.post("/hub-ticket", {
          contactId: contactId,
          userId: user?.id,
          status: "open",
          channel: "facebook",
        });
        handleSelectTicket(ticket);
        history.push(`/tickets/${ticket.id}`);
      }
    } catch (err) {
      toastError(err);
    }
    setLoading(false);
  };

  const loadMore = () => {
    setPageNumber((prevState) => prevState + 1);
  };

  const handleScroll = (e) => {
    if (!hasMore || loading) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - (scrollTop + 100) < clientHeight) {
      loadMore();
    }
  };

  return (
    <MainContainer className={classes.mainContainer}>
      <NewTicketModal
        modalOpen={newTicketModalOpen}
        initialContact={contactTicket}
        onClose={(ticket) => handleCloseOrOpenTicket(ticket)}
      />
      <ContactModal
        open={contactModalOpen}
        onClose={handleCloseContactModal}
        aria-labelledby="form-dialog-title"
        contactId={selectedContactId}
      />
      <ConfirmationModal
        title={
          deletingContact
            ? `${i18n.t("contacts.confirmationModal.deleteTitle")} ${deletingContact.name}?`
            : blockingContact
            ? `Bloquear Contato ${blockingContact.name}?`
            : unBlockingContact
            ? `Desbloquear Contato ${unBlockingContact.name}?`
            : ImportContacts
            ? `${i18n.t("contacts.confirmationModal.importTitlte")}`
            : exportContact
            ? `${i18n.t("contacts.confirmationModal.exportContact")}`
            : `${i18n.t("contactListItems.confirmationModal.importTitlte")}`
        }
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() =>
          deletingContact
            ? handleDeleteContact(deletingContact.id)
            : blockingContact
            ? handleBlockContact(blockingContact.id)
            : unBlockingContact
            ? handleUnBlockContact(unBlockingContact.id)
            : ImportContacts
            ? handleImportContact()
            : handleImportExcel()
        }
      >
        {exportContact
          ? `${i18n.t("contacts.confirmationModal.exportContact")}`
          : deletingContact
          ? `${i18n.t("contacts.confirmationModal.deleteMessage")}`
          : blockingContact
          ? `${i18n.t("contacts.confirmationModal.blockContact")}`
          : unBlockingContact
          ? `${i18n.t("contacts.confirmationModal.unblockContact")}`
          : ImportContacts
          ? `${i18n.t("contacts.confirmationModal.importMessage")}`
          : `${i18n.t("contactListItems.confirmationModal.importMessage")}`}
      </ConfirmationModal>
      <ConfirmationModal
        title={i18n.t("contacts.confirmationModal.importChat")}
        open={confirmChatsOpen}
        onClose={() => setConfirmChatsOpen(false)}
        onConfirm={() => handleImportChats()}
      >
        {i18n.t("contacts.confirmationModal.wantImport")}
      </ConfirmationModal>
      {importContactModalOpen && (
        <ContactImportWpModal
          isOpen={importContactModalOpen}
          handleClose={() => setImportContactModalOpen(false)}
          selectedTags={selectedTags}
          hideNum={hideNum}
          userProfile={user.profile}
        />
      )}
      <MainHeader>
        <Title>{i18n.t("contacts.title")} ({contacts.length})</Title>
        <MainHeaderButtonsWrapper>
          <TagsFilter onFiltered={handleSelectedTags} />
          <TextField
            placeholder={i18n.t("contacts.searchPlaceholder")}
            type="search"
            value={searchParam}
            onChange={handleSearch}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="secondary" />
                </InputAdornment>
              ),
            }}
          />
          <PopupState variant="popover" popupId="demo-popup-menu">
            {(popupState) => (
              <React.Fragment>
                <Button
                  variant="contained"
                  color="primary"
                  {...bindTrigger(popupState)}
                >
                  Importar / Exportar
                  <ArrowDropDown />
                </Button>
                <Menu {...bindMenu(popupState)}>
                  <MenuItem
                    onClick={() => {
                      setConfirmOpen(true);
                      setImportContacts(true);
                      popupState.close();
                    }}
                  >
                    <ContactPhone
                      fontSize="small"
                      color="primary"
                      style={{ marginRight: 10 }}
                    />
                    {i18n.t("contacts.menu.importYourPhone")}
                  </MenuItem>
                  <MenuItem
                    onClick={() => setImportContactModalOpen(true)}
                  >
                    <Backup
                      fontSize="small"
                      color="primary"
                      style={{ marginRight: 10 }}
                    />
                    {i18n.t("contacts.menu.importToExcel")}
                  </MenuItem>
                </Menu>
              </React.Fragment>
            )}
          </PopupState>
          <Button
            variant="contained"
            color="primary"
            onClick={handleOpenContactModal}
          >
            {i18n.t("contacts.buttons.add")}
          </Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <Paper
        className={classes.mainPaper}
        variant="outlined"
        onScroll={handleScroll}
      >
        <input
          style={{ display: "none" }}
          id="upload"
          name="file"
          type="file"
          accept=".xls,.xlsx"
          onChange={() => setConfirmOpen(true)}
          ref={fileUploadRef}
        />
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>{i18n.t("contacts.table.name")}</TableCell>
              <TableCell align="center">{i18n.t("contacts.table.whatsapp")}</TableCell>
              <TableCell align="center">{i18n.t("contacts.table.email")}</TableCell>
              <TableCell align="center">Messenger ID</TableCell>
              <TableCell align="center">Instagram ID</TableCell>
              <TableCell align="center">{i18n.t("contacts.table.whatsapp")}</TableCell>
              <TableCell align="center">Status</TableCell>
              <TableCell align="center">{i18n.t("contacts.table.actions")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <>
              {contacts.map((contact) => {
                const formattedNumber = formatPhoneNumber(
                  contact.number,
                  contact.isGroup,
                  enableLGPD && hideNum,
                  user.profile
                );
                return (
                  <TableRow key={contact.id}>
                    <TableCell style={{ paddingRight: 0 }}>
                      <Avatar src={contact.profilePicUrl || contact.urlPicture} />
                    </TableCell>
                    <TableCell>{contact.name}</TableCell>
                    <TableCell align="center">{formattedNumber || contact.number}</TableCell>
                    <TableCell align="center">{contact.email}</TableCell>
                    <TableCell align="center">{contact.messengerId}</TableCell>
                    <TableCell align="center">{contact.instagramId}</TableCell>
                    <TableCell align="center">{contact?.whatsapp?.name}</TableCell>
                    <TableCell align="center">
                      {contact.active ? (
                        <CheckCircleIcon style={{ color: "green" }} fontSize="small" />
                      ) : (
                        <CancelIcon style={{ color: "red" }} fontSize="small" />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        disabled={!contact.active || (!isValidBrazilianPhoneNumber(contact.number) && !contact.messengerId && !contact.instagramId)}
                        onClick={() => {
                          setContactTicket(contact);
                          setNewTicketModalOpen(true);
                        }}
                      >
                        {contact.channel === "whatsapp" && <WhatsApp style={{ color: "green" }} />}
                        {contact.channel === "instagram" && <Instagram style={{ color: "purple" }} />}
                        {contact.channel === "facebook" && <Facebook style={{ color: "blue" }} />}
                        {!contact.channel && (
                          contact.number ? (
                            <WhatsApp style={{ color: "green" }} />
                          ) : contact.instagramId ? (
                            <Instagram style={{ color: "purple" }} />
                          ) : contact.messengerId ? (
                            <Facebook style={{ color: "blue" }} />
                          ) : null
                        )}
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => hadleEditContact(contact.id)}
                      >
                        <EditIcon color="secondary" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={
                          contact.active
                            ? () => {
                                setConfirmOpen(true);
                                setBlockingContact(contact);
                              }
                            : () => {
                                setConfirmOpen(true);
                                setUnBlockingContact(contact);
                              }
                        }
                      >
                        {contact.active ? (
                          <BlockIcon color="secondary" />
                        ) : (
                          <CheckCircleIcon color="secondary" />
                        )}
                      </IconButton>
                      <Can
                        role={user.profile}
                        perform="contacts-page:deleteContact"
                        yes={() => (
                          <IconButton
                            size="small"
                            onClick={() => {
                              setConfirmOpen(true);
                              setDeletingContact(contact);
                            }}
                          >
                            <DeleteOutlineIcon color="secondary" />
                          </IconButton>
                        )}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {loading && <TableRowSkeleton avatar columns={8} />}
            </>
          </TableBody>
        </Table>
      </Paper>
    </MainContainer>
  );
};

export default Contacts;