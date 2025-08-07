import React, { useContext, useEffect, useReducer, useState } from "react";
import { 
  Button, 
  IconButton, 
  Paper, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow, 
  Typography, 
  Box,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Grid
} from "@material-ui/core";
import { ExpandMore, Info, Help } from "@material-ui/icons";
import { makeStyles } from "@material-ui/core/styles";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import TableRowSkeleton from "../../components/TableRowSkeleton";
import Title from "../../components/Title";
import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";
import api from "../../services/api";
import { DeleteOutline, Edit } from "@material-ui/icons";
import PromptModal from "../../components/PromptModal";
import { toast } from "react-toastify";
import ConfirmationModal from "../../components/ConfirmationModal";
import { AuthContext } from "../../context/Auth/AuthContext";
import usePlans from "../../hooks/usePlans";
import { useHistory } from "react-router-dom/cjs/react-router-dom.min";
import ForbiddenPage from "../../components/ForbiddenPage";

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(2),
    overflowY: "auto",
    ...theme.scrollbarStyles,
    borderRadius: theme.shape.borderRadius,
    margin: theme.spacing(1, 2),
    [theme.breakpoints.down('sm')]: {
      margin: theme.spacing(1),
      padding: theme.spacing(1),
    },
  },
  helpPaper: {
    padding: theme.spacing(2),
    margin: theme.spacing(1, 2, 2, 2),
    backgroundColor: theme.palette.background.paper,
    borderRadius: theme.shape.borderRadius,
    [theme.breakpoints.down('sm')]: {
      margin: theme.spacing(1, 1, 2, 1),
    },
  },
  tableContainer: {
    maxHeight: 'calc(100vh - 200px)',
    overflowX: 'auto',
  },
  customTableCell: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing(1),
  },
  table: {
    minWidth: 650,
    [theme.breakpoints.down('sm')]: {
      minWidth: '100%',
    },
  },
  tableHead: {
    backgroundColor: theme.palette.background.default,
    '& th': {
      fontWeight: 600,
      padding: theme.spacing(1.5),
      borderBottom: `2px solid ${theme.palette.divider}`,
    },
  },
  tableRow: {
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  actionButton: {
    padding: theme.spacing(0.5),
    margin: theme.spacing(0, 0.5),
    '&:hover': {
      backgroundColor: theme.palette.action.selected,
    },
  },
  exampleCode: {
    backgroundColor: theme.palette.grey[100],
    padding: theme.spacing(1),
    borderRadius: theme.shape.borderRadius,
    fontFamily: 'monospace',
    fontSize: '0.875rem',
    margin: theme.spacing(1, 0),
    border: `1px solid ${theme.palette.divider}`,
  },
  mediaTypeChip: {
    margin: theme.spacing(0.5),
    fontWeight: 'bold',
  },
  helpIcon: {
    marginLeft: theme.spacing(1),
    color: theme.palette.primary.main,
  },
}));

const reducer = (state, action) => {
  if (action.type === "LOAD_PROMPTS") {
    const prompts = action.payload;
    const newPrompts = [];

    prompts.forEach((prompt) => {
      const promptIndex = state.findIndex((p) => p.id === prompt.id);
      if (promptIndex !== -1) {
        state[promptIndex] = prompt;
      } else {
        newPrompts.push(prompt);
      }
    });

    return [...state, ...newPrompts];
  }

  if (action.type === "UPDATE_PROMPTS") {
    const prompt = action.payload;
    const promptIndex = state.findIndex((p) => p.id === prompt.id);

    if (promptIndex !== -1) {
      state[promptIndex] = prompt;
      return [...state];
    } else {
      return [prompt, ...state];
    }
  }

  if (action.type === "DELETE_PROMPT") {
    const promptId = action.payload;
    const promptIndex = state.findIndex((p) => p.id === promptId);
    if (promptIndex !== -1) {
      state.splice(promptIndex, 1);
    }
    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }
};

const Prompts = () => {
  const classes = useStyles();
  const [prompts, dispatch] = useReducer(reducer, []);
  const [loading, setLoading] = useState(false);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const { user, socket } = useContext(AuthContext);
  const { getPlanCompany } = usePlans();
  const history = useHistory();
  const companyId = user.companyId;

  useEffect(() => {
    async function fetchData() {
      const planConfigs = await getPlanCompany(undefined, companyId);
      if (!planConfigs.plan.useOpenAi) {
        toast.error("Esta empresa não possui permissão para acessar essa página! Estamos lhe redirecionando.");
        setTimeout(() => {
          history.push(`/`);
        }, 1000);
      }
    }
    fetchData();
  }, [companyId, getPlanCompany, history]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/prompt");
        dispatch({ type: "LOAD_PROMPTS", payload: data.prompts });
        setLoading(false);
      } catch (err) {
        toastError(err);
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const onPromptEvent = (data) => {
      if (data.action === "update" || data.action === "create") {
        dispatch({ type: "UPDATE_PROMPTS", payload: data.prompt });
      }
      if (data.action === "delete") {
        dispatch({ type: "DELETE_PROMPT", payload: data.promptId });
      }
    };

    socket.on(`company-${companyId}-prompt`, onPromptEvent);
    return () => {
      socket.off(`company-${companyId}-prompt`, onPromptEvent);
    };
  }, [socket, companyId]);

  const handleOpenPromptModal = () => {
    setPromptModalOpen(true);
    setSelectedPrompt(null);
  };

  const handleClosePromptModal = () => {
    setPromptModalOpen(false);
    setSelectedPrompt(null);
  };

  const handleEditPrompt = (prompt) => {
    setSelectedPrompt(prompt);
    setPromptModalOpen(true);
  };

  const handleCloseConfirmationModal = () => {
    setConfirmModalOpen(false);
    setSelectedPrompt(null);
  };

  const handleDeletePrompt = async (promptId) => {
    try {
      const { data } = await api.delete(`/prompt/${promptId}`);
      toast.info(i18n.t(data.message));
    } catch (err) {
      toastError(err);
    }
    setSelectedPrompt(null);
  };

  return (
    <MainContainer>
      <ConfirmationModal
        title={
          selectedPrompt &&
          `${i18n.t("prompts.confirmationModal.deleteTitle")} ${selectedPrompt.name}?`
        }
        open={confirmModalOpen}
        onClose={handleCloseConfirmationModal}
        onConfirm={() => handleDeletePrompt(selectedPrompt.id)}
      >
        {i18n.t("prompts.confirmationModal.deleteMessage")}
      </ConfirmationModal>
      <PromptModal
        open={promptModalOpen}
        onClose={handleClosePromptModal}
        promptId={selectedPrompt?.id}
      />
      {user.profile === "user" ? (
        <ForbiddenPage />
      ) : (
        <>
          <MainHeader>
            <Title>
              {i18n.t("prompts.title")}
              <Help className={classes.helpIcon} />
            </Title>
            <MainHeaderButtonsWrapper>
              <Button
                variant="contained"
                color="primary"
                onClick={handleOpenPromptModal}
                sx={{
                  borderRadius: 8,
                  padding: '8px 16px',
                  textTransform: 'none',
                  fontWeight: 500,
                }}
              >
                {i18n.t("prompts.buttons.add")}
              </Button>
            </MainHeaderButtonsWrapper>
          </MainHeader>
          
          {/* Help Section */}
          <Paper className={classes.helpPaper} variant="outlined">
            <Box display="flex" alignItems="center" mb={2}>
              <Info color="primary" />
              <Typography variant="h6" style={{ marginLeft: 8 }}>
                Como usar Mídia nos Prompts
              </Typography>
            </Box>
            
            <Typography variant="body2" color="textSecondary" paragraph>
              Para enviar mídia através dos prompts, use os seguintes formatos obrigatórios:
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Chip 
                  label="📷 IMAGENS" 
                  color="primary" 
                  variant="outlined" 
                  className={classes.mediaTypeChip}
                />
                <div className={classes.exampleCode}>
                  imagem:"https://exemplo.com/foto.jpg"
                </div>
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Chip 
                  label="🎥 VÍDEOS" 
                  color="secondary" 
                  variant="outlined" 
                  className={classes.mediaTypeChip}
                />
                <div className={classes.exampleCode}>
                  video:"https://exemplo.com/video.mp4"
                </div>
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Chip 
                  label="📄 DOCUMENTOS" 
                  color="default" 
                  variant="outlined" 
                  className={classes.mediaTypeChip}
                />
                <div className={classes.exampleCode}>
                  documento:"https://exemplo.com/arquivo.pdf"
                </div>
              </Grid>
            </Grid>

            <Accordion style={{ marginTop: 16 }}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Typography variant="subtitle1" color="primary">
                  📝 Exemplo Completo de Prompt
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box>
                  <Typography variant="body2" paragraph>
                    <strong>Exemplo de prompt para uma loja de móveis:</strong>
                  </Typography>
                  <div className={classes.exampleCode}>
                    {`Assistente virtual:
Olá! Sou o assistente da MóveisTop 🪑

Seja bem-vindo! Temos várias opções disponíveis:

📦 Ver nosso catálogo completo:
imagem:"https://i.postimg.cc/QxNh9rtZ/catalogo-moveis.jpg"

🎥 Assista ao vídeo demonstrativo dos produtos:
video:"https://exemplo.com/demonstracao-moveis.mp4"

📄 Baixe nossa tabela de preços:
documento:"https://exemplo.com/tabela-precos.pdf"

Como posso ajudar você hoje? 😊`}
                  </div>
                  
                  <Typography variant="body2" color="textSecondary" style={{ marginTop: 16 }}>
                    <strong>Resultado:</strong> O cliente receberá a mensagem de texto junto com a imagem, vídeo e documento anexados automaticamente.
                  </Typography>
                </Box>
              </AccordionDetails>
            </Accordion>

            <Box mt={2}>
              <Typography variant="body2" color="textSecondary">
                <strong>Dicas importantes:</strong>
              </Typography>
              <Typography variant="body2" color="textSecondary" component="div">
                • Use aspas duplas para os links<br/>
                • Os arquivos serão baixados e enviados automaticamente<br/>
                • O texto do prompt será usado como legenda da mídia<br/>
                • Você pode combinar múltiplos tipos de mídia no mesmo prompt
              </Typography>
            </Box>
          </Paper>

          <Paper className={classes.mainPaper} variant="outlined" elevation={2}>
            <TableContainer className={classes.tableContainer}>
              <Table size="medium" className={classes.table} stickyHeader>
                <TableHead className={classes.tableHead}>
                  <TableRow>
                    <TableCell align="left" style={{ width: '30%' }}>
                      {i18n.t("prompts.table.name")}
                    </TableCell>
                    <TableCell align="left" style={{ width: '30%' }}>
                      {i18n.t("prompts.table.queue")}
                    </TableCell>
                    <TableCell align="left" style={{ width: '20%' }}>
                      {i18n.t("prompts.table.max_tokens")}
                    </TableCell>
                    <TableCell align="center" style={{ width: '20%' }}>
                      {i18n.t("prompts.table.actions")}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {prompts.map((prompt) => (
                    <TableRow key={prompt.id} className={classes.tableRow}>
                      <TableCell align="left">{prompt.name}</TableCell>
                      <TableCell align="left">{prompt.queue?.name || '-'}</TableCell>
                      <TableCell align="left">{prompt.maxTokens}</TableCell>
                      <TableCell align="center" className={classes.customTableCell}>
                        <IconButton
                          size="small"
                          onClick={() => handleEditPrompt(prompt)}
                          className={classes.actionButton}
                          aria-label="edit prompt"
                        >
                          <Edit />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => {
                            setSelectedPrompt(prompt);
                            setConfirmModalOpen(true);
                          }}
                          className={classes.actionButton}
                          aria-label="delete prompt"
                        >
                          <DeleteOutline />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  {loading && <TableRowSkeleton columns={4} />}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}
    </MainContainer>
  );
};

export default Prompts;