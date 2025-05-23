import React, { useState, useEffect, useContext, useCallback } from "react";
import { useHistory, useParams } from "react-router-dom";
import { toast } from "react-toastify";

// Material UI imports
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Button from "@material-ui/core/Button";
import { Box, CircularProgress } from "@material-ui/core";
import { Stack, Typography, SpeedDial, SpeedDialAction, SpeedDialIcon } from "@mui/material";

// React Flow imports
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
} from "react-flow-renderer";
import "reactflow/dist/style.css";

// Lucide icons
import {
  Rocket,
  FileText,
  ListTree,
  Split,
  Clock,
  Ticket,
  Image,
  Mic,
  Shuffle,
  Video,
  MessageSquare,
  Bot,
  BrainCircuit,
  HelpCircle,
  Plus,
  LayoutGrid,
  Save
} from "lucide-react";

// Custom nodes
import audioNode from "./nodes/audioNode";
import typebotNode from "./nodes/typebotNode";
import openaiNode from "./nodes/openaiNode";
import messageNode from "./nodes/messageNode.js";
import startNode from "./nodes/startNode";
import menuNode from "./nodes/menuNode";
import intervalNode from "./nodes/intervalNode";
import imgNode from "./nodes/imgNode";
import randomizerNode from "./nodes/randomizerNode";
import videoNode from "./nodes/videoNode";
import questionNode from "./nodes/questionNode";
import singleBlockNode from "./nodes/singleBlockNode";
import ticketNode from "./nodes/ticketNode";
import RemoveEdge from "./nodes/removeEdge";

// Components
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import FlowBuilderAddTextModal from "../../components/FlowBuilderAddTextModal";
import FlowBuilderIntervalModal from "../../components/FlowBuilderIntervalModal";
import FlowBuilderConditionModal from "../../components/FlowBuilderConditionModal";
import FlowBuilderMenuModal from "../../components/FlowBuilderMenuModal";
import FlowBuilderAddImgModal from "../../components/FlowBuilderAddImgModal";
import FlowBuilderTicketModal from "../../components/FlowBuilderAddTicketModal";
import FlowBuilderAddAudioModal from "../../components/FlowBuilderAddAudioModal";
import FlowBuilderRandomizerModal from "../../components/FlowBuilderRandomizerModal";
import FlowBuilderAddVideoModal from "../../components/FlowBuilderAddVideoModal";
import FlowBuilderSingleBlockModal from "../../components/FlowBuilderSingleBlockModal";
import FlowBuilderTypebotModal from "../../components/FlowBuilderAddTypebotModal";
import FlowBuilderOpenAIModal from "../../components/FlowBuilderAddOpenAIModal";
import FlowBuilderAddQuestionModal from "../../components/FlowBuilderAddQuestionModal";

// Services and utilities
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { useNodeStorage } from "../../stores/useNodeStorage";
import { colorPrimary } from "../../styles/styles";

// Typebot icon (assuming it's still needed)
import typebotIcon from "../../assets/typebot-ico.png";

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(1),
    position: "relative",
    backgroundColor: "#F8F9FA",
    overflowY: "scroll",
    ...theme.scrollbarStyles,
  },
  speedDial: {
    position: "absolute",
    top: 16,
    left: 16,
    "& .MuiSpeedDial-fab": {
      backgroundColor: colorPrimary(),
      "&:hover": {
        backgroundColor: colorPrimary(),
      },
    },
  },
  saveButton: {
    textTransform: "none",
    marginBottom: theme.spacing(2),
  },
  flowContainer: {
    width: "100%",
    height: "90%",
    position: "relative",
    display: "flex",
  },
  miniMapOverlay: {
    backgroundColor: "#FAFAFA",
    height: "20px",
    width: "58px",
    position: "absolute",
    bottom: 0,
    right: 0,
    zIndex: 1111,
  },
  loadingContainer: {
    height: "70vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  promptText: {
    color: "#010101",
    textShadow: "#010101 1px 0 10px",
    textAlign: "center",
    marginBottom: theme.spacing(2),
  },
}));

// Helper function to generate random string IDs
const generateRandomString = (length) => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

// Node types for React Flow
const nodeTypes = {
  message: messageNode,
  start: startNode,
  menu: menuNode,
  interval: intervalNode,
  img: imgNode,
  audio: audioNode,
  randomizer: randomizerNode,
  video: videoNode,
  singleBlock: singleBlockNode,
  ticket: ticketNode,
  typebot: typebotNode,
  openai: openaiNode,
  question: questionNode,
};

// Edge types for React Flow
const edgeTypes = {
  buttonedge: RemoveEdge,
};

// Initial nodes for the flow
const initialNodes = [
  {
    id: "1",
    position: { x: 250, y: 100 },
    data: { label: "Inicio do fluxo" },
    type: "start",
  },
];

// Initial edges for the flow
const initialEdges = [];

export const FlowBuilderConfig = () => {
  const classes = useStyles();
  const history = useHistory();
  const { id } = useParams();
  const storageItems = useNodeStorage();
  const { user } = useContext(AuthContext);

  // State variables
  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [dataNode, setDataNode] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  
  // Modal states
  const [modalAddText, setModalAddText] = useState(null);
  const [modalAddInterval, setModalAddInterval] = useState(false);
  const [modalAddMenu, setModalAddMenu] = useState(null);
  const [modalAddImg, setModalAddImg] = useState(null);
  const [modalAddAudio, setModalAddAudio] = useState(null);
  const [modalAddRandomizer, setModalAddRandomizer] = useState(null);
  const [modalAddVideo, setModalAddVideo] = useState(null);
  const [modalAddSingleBlock, setModalAddSingleBlock] = useState(null);
  const [modalAddTicket, setModalAddTicket] = useState(null);
  const [modalAddTypebot, setModalAddTypebot] = useState(null);
  const [modalAddOpenAI, setModalAddOpenAI] = useState(null);
  const [modalAddQuestion, setModalAddQuestion] = useState(null);

  // React Flow states
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Connection line style
  const connectionLineStyle = { stroke: "#2b2b2b", strokeWidth: "6px" };

  // Load flow data
  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      const fetchFlow = async () => {
        try {
          const { data } = await api.get(`/flowbuilder/flow/${id}`);
          if (data.flow.flow !== null) {
            const flowNodes = data.flow.flow.nodes;
            setNodes(flowNodes);
            setEdges(data.flow.flow.connections);
            
            // Extract variables for TypeBot integration
            const filterVariables = flowNodes.filter(nd => nd.type === "question");
            const variables = filterVariables.map(variable => variable.data.typebotIntegration.answerKey);
            localStorage.setItem('variables', JSON.stringify(variables));
          }
          setLoading(false);
        } catch (err) {
          toastError(err);
          setLoading(false);
        }
      };
      fetchFlow();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [id]);

  // Handle node storage actions (delete, duplicate)
  useEffect(() => {
    if (storageItems.action === "delete") {
      setNodes((old) => old.filter((item) => item.id !== storageItems.node));
      setEdges((old) => {
        const newData = old.filter((item) => item.source !== storageItems.node);
        return newData.filter((item) => item.target !== storageItems.node);
      });
      storageItems.setNodesStorage("");
      storageItems.setAct("idle");
    }
    
    if (storageItems.action === "duplicate") {
      const nodeDuplicate = nodes.find((item) => item.id === storageItems.node);
      if (nodeDuplicate) {
        const positionsX = nodes.map((node) => node.position.x);
        const maxX = Math.max(...positionsX);
        const lastY = nodes[nodes.length - 1].position.y;
        
        const newNode = {
          ...nodeDuplicate,
          id: generateRandomString(30),
          position: {
            x: maxX + 240,
            y: lastY,
          },
          selected: false,
          style: { backgroundColor: "#555555", padding: 0, borderRadius: 8 },
        };
        
        setNodes((old) => [...old, newNode]);
      }
      storageItems.setNodesStorage("");
      storageItems.setAct("idle");
    }
  }, [storageItems.action, storageItems.node, nodes]);

  // Pagination handling
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

  // React Flow event handlers
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const doubleClickNode = (event, node) => {
    setDataNode(node);
    
    const nodeTypeToModalMap = {
      message: setModalAddText,
      interval: setModalAddInterval,
      menu: setModalAddMenu,
      img: setModalAddImg,
      audio: setModalAddAudio,
      randomizer: setModalAddRandomizer,
      singleBlock: setModalAddSingleBlock,
      ticket: setModalAddTicket,
      typebot: setModalAddTypebot,
      openai: setModalAddOpenAI,
      question: setModalAddQuestion,
      video: setModalAddVideo
    };
    
    const setModalFunction = nodeTypeToModalMap[node.type];
    if (setModalFunction) {
      setModalFunction("edit");
    }
  };

  const clickNode = (event, node) => {
    setNodes((old) =>
      old.map((item) => ({
        ...item,
        style: {
          backgroundColor: item.id === node.id ? "#0000FF" : "#13111C",
          padding: item.id === node.id ? 1 : 0,
          borderRadius: 8,
        },
      }))
    );
  };

  const clickEdge = () => {
    setNodes((old) =>
      old.map((item) => ({
        ...item,
        style: { backgroundColor: "#13111C", padding: 0, borderRadius: 8 },
      }))
    );
  };

  // Save flow to the server
  const saveFlow = async () => {
    try {
      await api.post("/flowbuilder/flow", {
        idFlow: id,
        nodes: nodes,
        connections: edges,
      });
      toast.success("Fluxo salvo com sucesso");
    } catch (error) {
      toastError(error);
    }
  };

  // Update node data
  const updateNode = (dataAlter) => {
    setNodes((old) =>
      old.map((itemNode) => {
        if (itemNode.id === dataAlter.id) {
          return dataAlter;
        }
        return itemNode;
      })
    );
    
    // Close all modals
    setModalAddText(null);
    setModalAddInterval(null);
    setModalAddMenu(null);
    setModalAddImg(null);
    setModalAddAudio(null);
    setModalAddRandomizer(null);
    setModalAddVideo(null);
    setModalAddSingleBlock(null);
    setModalAddTicket(null);
    setModalAddTypebot(null);
    setModalAddOpenAI(null);
    setModalAddQuestion(null);
  };

  // Add a new node to the flow
  const addNode = (type, data = {}) => {
    const posY = nodes.length > 0 ? nodes[nodes.length - 1].position.y : 100;
    const posX = nodes.length > 0 
      ? nodes[nodes.length - 1].position.x + (nodes[nodes.length - 1].width || 150) + 40 
      : 250;

    const nodeTypeMap = {
      start: {
        id: "1",
        position: { x: posX, y: posY },
        data: { label: "Inicio do fluxo" },
        type: "start",
      },
      text: {
        id: generateRandomString(30),
        position: { x: posX, y: posY },
        data: { label: data.text },
        type: "message",
      },
      interval: {
        id: generateRandomString(30),
        position: { x: posX, y: posY },
        data: { label: `Intervalo ${data.sec} seg.`, sec: data.sec },
        type: "interval",
      },
      menu: {
        id: generateRandomString(30),
        position: { x: posX, y: posY },
        data: {
          message: data.message,
          arrayOption: data.arrayOption,
        },
        type: "menu",
      },
      img: {
        id: generateRandomString(30),
        position: { x: posX, y: posY },
        data: { url: data.url },
        type: "img",
      },
      audio: {
        id: generateRandomString(30),
        position: { x: posX, y: posY },
        data: { url: data.url, record: data.record },
        type: "audio",
      },
      randomizer: {
        id: generateRandomString(30),
        position: { x: posX, y: posY },
        data: { percent: data.percent },
        type: "randomizer",
      },
      video: {
        id: generateRandomString(30),
        position: { x: posX, y: posY },
        data: { url: data.url },
        type: "video",
      },
      singleBlock: {
        id: generateRandomString(30),
        position: { x: posX, y: posY },
        data: { ...data },
        type: "singleBlock",
      },
      ticket: {
        id: generateRandomString(30),
        position: { x: posX, y: posY },
        data: { ...data },
        type: "ticket",
      },
      typebot: {
        id: generateRandomString(30),
        position: { x: posX, y: posY },
        data: { ...data },
        type: "typebot",
      },
      openai: {
        id: generateRandomString(30),
        position: { x: posX, y: posY },
        data: { ...data },
        type: "openai",
      },
      question: {
        id: generateRandomString(30),
        position: { x: posX, y: posY },
        data: { ...data },
        type: "question",
      },
    };

    if (type === "start") {
      setNodes([nodeTypeMap.start]);
    } else if (nodeTypeMap[type]) {
      setNodes((old) => [...old, nodeTypeMap[type]]);
    }
  };

  // Handler functions for each node type
  const nodeHandlers = {
    textAdd: (data) => addNode("text", data),
    intervalAdd: (data) => addNode("interval", data),
    conditionAdd: (data) => addNode("condition", data),
    menuAdd: (data) => addNode("menu", data),
    imgAdd: (data) => addNode("img", data),
    audioAdd: (data) => addNode("audio", data),
    randomizerAdd: (data) => addNode("randomizer", data),
    videoAdd: (data) => addNode("video", data),
    singleBlockAdd: (data) => addNode("singleBlock", data),
    ticketAdd: (data) => addNode("ticket", data),
    typebotAdd: (data) => addNode("typebot", data),
    openaiAdd: (data) => addNode("openai", data),
    questionAdd: (data) => addNode("question", data),
  };

  // Speed dial actions
  const speedDialActions = [
    {
      icon: <Rocket color="#3ABA38" size={20} />,
      name: "Inicio",
      type: "start",
    },
    {
      icon: <FileText color="#EC5858" size={20} />,
      name: "Conteúdo",
      type: "content",
    },
    {
      icon: <ListTree color="#683AC8" size={20} />,
      name: "Menu",
      type: "menu",
    },
    {
      icon: <Split color="#1FBADC" size={20} />,
      name: "Randomizador",
      type: "random",
    },
    {
      icon: <Clock color="#F7953B" size={20} />,
      name: "Intervalo",
      type: "interval",
    },
    {
      icon: <Ticket color="#F7953B" size={20} />,
      name: "Ticket",
      type: "ticket",
    },
    {
      icon: <Bot color="#3ABA38" size={20} />,
      name: "TypeBot",
      type: "typebot",
    },
    {
      icon: <BrainCircuit color="#F7953B" size={20} />,
      name: "OpenAI/GEMINI(GOOGLE)",
      type: "openai",
    },
    {
      icon: <HelpCircle color="#F7953B" size={20} />,
      name: "Pergunta",
      type: "question",
    },
  ];

  // Handle speed dial action clicks
  const handleSpeedDialAction = (type) => {
    const actionMap = {
      start: () => addNode("start"),
      menu: () => setModalAddMenu("create"),
      content: () => setModalAddSingleBlock("create"),
      random: () => setModalAddRandomizer("create"),
      interval: () => setModalAddInterval("create"),
      ticket: () => setModalAddTicket("create"),
      typebot: () => setModalAddTypebot("create"),
      openai: () => setModalAddOpenAI("create"),
      question: () => setModalAddQuestion("create"),
    };

    const action = actionMap[type];
    if (action) {
      action();
    }
  };

  return (
    <Stack sx={{ height: "100vh" }}>
      {/* Modals */}
      <FlowBuilderAddTextModal
        open={modalAddText}
        onSave={nodeHandlers.textAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddText}
      />
      <FlowBuilderIntervalModal
        open={modalAddInterval}
        onSave={nodeHandlers.intervalAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddInterval}
      />
      <FlowBuilderMenuModal
        open={modalAddMenu}
        onSave={nodeHandlers.menuAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddMenu}
      />
      <FlowBuilderAddImgModal
        open={modalAddImg}
        onSave={nodeHandlers.imgAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddImg}
      />
      <FlowBuilderAddAudioModal
        open={modalAddAudio}
        onSave={nodeHandlers.audioAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddAudio}
      />
      <FlowBuilderRandomizerModal
        open={modalAddRandomizer}
        onSave={nodeHandlers.randomizerAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddRandomizer}
      />
      <FlowBuilderAddVideoModal
        open={modalAddVideo}
        onSave={nodeHandlers.videoAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddVideo}
      />
      <FlowBuilderSingleBlockModal
        open={modalAddSingleBlock}
        onSave={nodeHandlers.singleBlockAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddSingleBlock}
      />
      <FlowBuilderTicketModal
        open={modalAddTicket}
        onSave={nodeHandlers.ticketAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddTicket}
      />
      <FlowBuilderOpenAIModal
        open={modalAddOpenAI}
        onSave={nodeHandlers.openaiAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddOpenAI}
      />
      <FlowBuilderTypebotModal
        open={modalAddTypebot}
        onSave={nodeHandlers.typebotAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddTypebot}
      />
      <FlowBuilderAddQuestionModal
        open={modalAddQuestion}
        onSave={nodeHandlers.questionAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddQuestion}
      />

      {/* Header */}
      <MainHeader>
        <Title>Desenhe seu fluxo</Title>
      </MainHeader>

      {loading ? (
        <Stack className={classes.loadingContainer}>
          <CircularProgress />
        </Stack>
      ) : (
        <Paper
          className={classes.mainPaper}
          variant="outlined"
          onScroll={handleScroll}
        >
          {/* Speed Dial Menu */}
          <SpeedDial
            ariaLabel="Flow Builder Actions"
            className={classes.speedDial}
            icon={<SpeedDialIcon />}
            direction="down"
          >
            {speedDialActions.map((action) => (
              <SpeedDialAction
                key={action.name}
                icon={action.icon}
                tooltipTitle={action.name}
                tooltipOpen
                tooltipPlacement="right"
                onClick={() => handleSpeedDialAction(action.type)}
              />
            ))}
          </SpeedDial>

          {/* Reminder Text */}
          <Typography className={classes.promptText}>
            Não se esqueça de salvar seu fluxo!
          </Typography>

          {/* Save Button */}
          <Stack direction="row" justifyContent="flex-end" mb={2}>
            <Button
              className={classes.saveButton}
              variant="contained"
              color="primary"
              onClick={saveFlow}
              startIcon={<Save size={18} />}
            >
              Salvar
            </Button>
          </Stack>

          {/* Flow Builder */}
          <Stack className={classes.flowContainer}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              deleteKeyCode={["Backspace", "Delete"]}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeDoubleClick={doubleClickNode}
              onNodeClick={clickNode}
              onEdgeClick={clickEdge}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              connectionLineStyle={connectionLineStyle}
              style={{
                backgroundColor: "#F8F9FA",
              }}
              defaultEdgeOptions={{
                style: { color: "#ff0000", strokeWidth: "6px" },
                animated: false,
              }}
            >
              <Controls />
              <MiniMap />
              <Background variant="dots" gap={12} size={-1} />
            </ReactFlow>

            {/* MiniMap overlay fix */}
            <Stack className={classes.miniMapOverlay} />
          </Stack>
        </Paper>
      )}
    </Stack>
  );
};

export default FlowBuilderConfig;