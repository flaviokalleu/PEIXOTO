import React, { useState, useContext } from "react";
import { MenuItem, Menu } from "@material-ui/core";
import PropTypes from "prop-types";
import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import ConfirmationModal from "../ConfirmationModal";
import InformationModal from "../InformationModal";
import { ReplyMessageContext } from "../../context/ReplyingMessage/ReplyingMessageContext";
import { ForwardMessageContext } from "../../context/ForwarMessage/ForwardMessageContext";
import { EditMessageContext } from "../../context/EditingMessage/EditingMessageContext";
import { TicketsContext } from "../../context/Tickets/TicketsContext";
import toastError from "../../errors/toastError";
import { useHistory } from "react-router-dom";
import { AuthContext } from "../../context/Auth/AuthContext";
import ForwardModal from "../ForwardMessageModal";
import ShowTicketOpen from "../ShowTicketOpenModal";
import AcceptTicketWithoutQueue from "../AcceptTicketWithoutQueueModal";

const MessageOptionsMenu = ({
  message,
  menuOpen,
  handleClose,
  anchorEl,
  isGroup,
  queueId,
  whatsappId,
}) => {
  const { setReplyingMessage } = useContext(ReplyMessageContext);
  const { user } = useContext(AuthContext);
  const { setEditingMessage } = useContext(EditMessageContext) || {};
  const { setTabOpen } = useContext(TicketsContext);
  const history = useHistory();

  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [openAlert, setOpenAlert] = useState(false);
  const [userTicketOpen, setUserTicketOpen] = useState("");
  const [queueTicketOpen, setQueueTicketOpen] = useState("");
  const [acceptTicketWithouSelectQueueOpen, setAcceptTicketWithouSelectQueueOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(null);

  // Transcrição de áudio
  const [showTranscribedText, setShowTranscribedText] = useState(false);
  const [audioMessageTranscribeToText, setAudioMessageTranscribeToText] = useState("");

  const {
    showSelectMessageCheckbox,
    setShowSelectMessageCheckbox,
    selectedMessages,
    forwardMessageModalOpen,
    setForwardMessageModalOpen,
  } = useContext(ForwardMessageContext);

  const handleSaveTicket = async (contactId) => {
    if (!contactId) return;

    try {
      const { data: ticket } = await api.post("/tickets", {
        contactId,
        userId: user?.id,
        status: "open",
        queueId,
        whatsappId,
      });

      setTicketOpen(ticket);
      if (ticket.queueId === null) {
        setAcceptTicketWithouSelectQueueOpen(true);
      } else {
        setTabOpen("open");
        history.push(`/tickets/${ticket.uuid}`);
      }
    } catch (err) {
      try {
        const ticket = JSON.parse(err.response.data.error);
        if (ticket.userId !== user?.id) {
          setOpenAlert(true);
          setUserTicketOpen(ticket.user.name);
          setQueueTicketOpen(ticket.queue.name);
        } else {
          setOpenAlert(false);
          setUserTicketOpen("");
          setQueueTicketOpen("");
          setTabOpen(ticket.status);
          history.push(`/tickets/${ticket.uuid}`);
        }
      } catch (parseErr) {
        toastError(err);
      }
    }
    handleClose();
  };

  const handleCloseAlert = () => {
    setOpenAlert(false);
    setUserTicketOpen("");
    setQueueTicketOpen("");
  };

  const handleSetShowSelectCheckbox = () => {
    setShowSelectMessageCheckbox(!showSelectMessageCheckbox);
    handleClose();
  };

  const handleDeleteMessage = async () => {
    try {
      await api.delete(`/messages/${message.id}`);
    } catch (err) {
      toastError(err);
    }
  };

  const handleEditMessage = () => {
    if (setEditingMessage) {
      setEditingMessage(message);
    }
    handleClose();
  };

  const handleTranscriptionAudioToText = async () => {
    try {
      if (!message.mediaUrl) {
        throw new Error("URL do áudio não disponível");
      }
      const audioUrl = String(message.mediaUrl);
      console.log("Audio URL:", audioUrl); // Debug
      const match = audioUrl.match(/\/([^\/]+\.(ogg|mp3))$/);
      const extractedPart = match ? match[1] : null;
      console.log("Extracted Part:", extractedPart); // Debug
      if (!extractedPart) {
        throw new Error("Formato de URL de áudio inesperado");
      }
      const response = await api.get(`/messages/transcribeAudio/${extractedPart}`);
      console.log("API Response:", response.data); // Debug
      const { data } = response;
      if (data && data.transcribedText) {
        const transcription = typeof data.transcribedText === "string"
          ? data.transcribedText
          : data.transcribedText.transcription || "";
        if (transcription) {
          console.log("Transcription:", transcription); // Debug
          setAudioMessageTranscribeToText(transcription);
          setShowTranscribedText(true);
        } else {
          throw new Error("Nenhuma transcrição disponível");
        }
      } else if (data && data.error) {
        throw new Error(data.error);
      } else {
        throw new Error("Dados de transcrição inválidos");
      }
    } catch (err) {
      console.error("Transcription Error:", err); // Debug
      toastError(err.message || "Erro ao transcrever áudio");
    }
  };

  const handleReplyMessage = () => {
    setReplyingMessage(message);
    handleClose();
  };

  const isWithinFifteenMinutes = () => {
    const fifteenMinutesInMilliseconds = 15 * 60 * 1000;
    const currentTime = new Date();
    const messageTime = new Date(message.createdAt);
    return currentTime - messageTime <= fifteenMinutesInMilliseconds;
  };

  const handleOpenConfirmationModal = () => {
    setConfirmationOpen(true);
    handleClose();
  };

  return (
    <>
      <AcceptTicketWithoutQueue
        modalOpen={acceptTicketWithouSelectQueueOpen}
        onClose={() => setAcceptTicketWithouSelectQueueOpen(false)}
        ticket={ticketOpen}
        ticketId={ticketOpen?.id}
      />
      <ShowTicketOpen
        isOpen={openAlert}
        handleClose={handleCloseAlert}
        user={userTicketOpen}
        queue={queueTicketOpen}
      />
      <ConfirmationModal
        title={i18n.t("messageOptionsMenu.confirmationModal.title")}
        open={confirmationOpen}
        onClose={() => setConfirmationOpen(false)}
        onConfirm={handleDeleteMessage}
      >
        {i18n.t("messageOptionsMenu.confirmationModal.message")}
      </ConfirmationModal>

      <InformationModal
        title={i18n.t("Transcrição de áudio")}
        open={showTranscribedText}
        onClose={() => setShowTranscribedText(false)}
      >
        {audioMessageTranscribeToText || "Nenhuma transcrição disponível."}
      </InformationModal>

      <ForwardModal
        modalOpen={forwardMessageModalOpen}
        messages={selectedMessages}
        onClose={() => {
          setForwardMessageModalOpen(false);
          setShowSelectMessageCheckbox(false);
        }}
      />
      <Menu
        anchorEl={anchorEl}
        getContentAnchorEl={null}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        open={menuOpen}
        onClose={handleClose}
      >
        {message.fromMe && (
          <MenuItem key="delete" onClick={handleOpenConfirmationModal}>
            {i18n.t("messageOptionsMenu.delete")}
          </MenuItem>
        )}
        {message.fromMe && isWithinFifteenMinutes() && (
          <MenuItem key="edit" onClick={handleEditMessage}>
            {i18n.t("messageOptionsMenu.edit")}
          </MenuItem>
        )}
        {message.mediaType === "audio" && !message.fromMe && (
          <MenuItem
            key="transcribe"
            onClick={() => {
              console.log("Transcribe MenuItem clicked for message:", message); // Debug
              handleTranscriptionAudioToText();
            }}
          >
            {i18n.t("Transcrever áudio")}
          </MenuItem>
        )}
        <MenuItem key="reply" onClick={handleReplyMessage}>
          {i18n.t("messageOptionsMenu.reply")}
        </MenuItem>
        <MenuItem key="forward" onClick={handleSetShowSelectCheckbox}>
          {i18n.t("messageOptionsMenu.forward")}
        </MenuItem>
        {!message.fromMe && isGroup && (
          <MenuItem key="talkTo" onClick={() => handleSaveTicket(message?.contact?.id)}>
            {i18n.t("messageOptionsMenu.talkTo")}
          </MenuItem>
        )}
      </Menu>
    </>
  );
};

MessageOptionsMenu.propTypes = {
  message: PropTypes.object.isRequired,
  menuOpen: PropTypes.bool.isRequired,
  handleClose: PropTypes.func.isRequired,
  anchorEl: PropTypes.object,
  isGroup: PropTypes.bool,
  queueId: PropTypes.number,
  whatsappId: PropTypes.number,
};

export default MessageOptionsMenu;