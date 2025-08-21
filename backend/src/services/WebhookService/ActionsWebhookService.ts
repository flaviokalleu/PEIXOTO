import AppError from "../../errors/AppError";
import { WebhookModel } from "../../models/Webhook";
import { sendMessageFlow } from "../../controllers/MessageController";
import { IConnections, INodes } from "./DispatchWebHookService";
import { Request, Response } from "express";
import { ParamsDictionary } from "express-serve-static-core";
import { ParsedQs } from "qs";
import CreateContactService from "../ContactServices/CreateContactService";
import Contact from "../../models/Contact";
import CreateTicketService from "../TicketServices/CreateTicketService";
import CreateTicketServiceWebhook from "../TicketServices/CreateTicketServiceWebhook";
import { SendMessage } from "../../helpers/SendMessage";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import Ticket from "../../models/Ticket";
import fs from "fs";
import GetWhatsappWbot from "../../helpers/GetWhatsappWbot";
import path from "path";
import SendWhatsAppMedia from "../WbotServices/SendWhatsAppMedia";
import SendWhatsAppMediaFlow, {
  typeSimulation
} from "../WbotServices/SendWhatsAppMediaFlow";
import { randomizarCaminho } from "../../utils/randomizador";
import { SendMessageFlow } from "../../helpers/SendMessageFlow";
import formatBody from "../../helpers/Mustache";
import SetTicketMessagesAsRead from "../../helpers/SetTicketMessagesAsRead";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import ShowTicketService from "../TicketServices/ShowTicketService";
import CreateMessageService, {
  MessageData
} from "../MessageServices/CreateMessageService";
import { randomString } from "../../utils/randomCode";
import ShowQueueService from "../QueueService/ShowQueueService";
import { getIO } from "../../libs/socket";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import ShowTicketUUIDService from "../TicketServices/ShowTicketFromUUIDService";
import logger from "../../utils/logger";
import CreateLogTicketService from "../TicketServices/CreateLogTicketService";
import CompaniesSettings from "../../models/CompaniesSettings";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import { delay } from "bluebird";
import typebotListener from "../TypebotServices/typebotListener";
import { getWbot } from "../../libs/wbot";
import { proto } from "@whiskeysockets/baileys";
import { handleOpenAi } from "../IntegrationsServices/OpenAiService";
import { IOpenAi } from "../../@types/openai";

interface IAddContact {
  companyId: number;
  name: string;
  phoneNumber: string;
  email?: string;
  dataMore?: any;
}

export const ActionsWebhookService = async (
  whatsappId: number,
  idFlowDb: number,
  companyId: number,
  nodes: INodes[],
  connects: IConnections[],
  nextStage: string,
  dataWebhook: any,
  details: any,
  hashWebhookId: string,
  pressKey?: string,
  idTicket?: number,
  numberPhrase: "" | { number: string; name: string; email: string } = "",
  msg?: proto.IWebMessageInfo
): Promise<string> => {
  try {
    const io = getIO();

    // Inicializar next com nextStage ou buscar do ticket se nextStage for null
    let next = nextStage;
    if (idTicket && (!next || next === "null")) {
      const ticket = await Ticket.findOne({ where: { id: idTicket, companyId } });
      if (ticket) {
        next = ticket.lastFlowId || ticket.lastFlowId || next;
      }
    }
    

    let createFieldJsonName = "";
    const connectStatic = connects;
    if (numberPhrase === "") {
      const nameInput = details.inputs.find(item => item.keyValue === "nome");
      nameInput.data.split(",").map(dataN => {
        const lineToData = details.keysFull.find(item => item === dataN);
        let sumRes = "";
        if (!lineToData) {
          sumRes = dataN;
        } else {
          sumRes = constructJsonLine(lineToData, dataWebhook);
        }
        createFieldJsonName = createFieldJsonName + sumRes;
      });
    } else {
      createFieldJsonName = numberPhrase.name;
    }

    let numberClient = "";
    if (numberPhrase === "") {
      const numberInput = details.inputs.find(
        item => item.keyValue === "celular"
      );
      numberInput.data.split(",").map(dataN => {
        const lineToDataNumber = details.keysFull.find(item => item === dataN);
        let createFieldJsonNumber = "";
        if (!lineToDataNumber) {
          createFieldJsonNumber = dataN;
        } else {
          createFieldJsonNumber = constructJsonLine(
            lineToDataNumber,
            dataWebhook
          );
        }
        numberClient = numberClient + createFieldJsonNumber;
      });
    } else {
      numberClient = numberPhrase.number;
    }

    numberClient = removerNaoLetrasNumeros(numberClient);
    if (numberClient.substring(0, 2) === "55") {
      if (parseInt(numberClient.substring(2, 4)) >= 31) {
        if (numberClient.length === 13) {
          numberClient =
            numberClient.substring(0, 4) + numberClient.substring(5, 13);
        }
      }
    }

    let createFieldJsonEmail = "";
    if (numberPhrase === "") {
      const emailInput = details.inputs.find(item => item.keyValue === "email");
      emailInput.data.split(",").map(dataN => {
        const lineToDataEmail = details.keysFull.find(item =>
          item.endsWith("email")
        );
        let sumRes = "";
        if (!lineToDataEmail) {
          sumRes = dataN;
        } else {
          sumRes = constructJsonLine(lineToDataEmail, dataWebhook);
        }
        createFieldJsonEmail = createFieldJsonEmail + sumRes;
      });
    } else {
      createFieldJsonEmail = numberPhrase.email;
    }

    const lengthLoop = nodes.length;
    const whatsapp = await GetDefaultWhatsApp(whatsappId, companyId);

    if (whatsapp.status !== "CONNECTED") {
      return "whatsapp not connected";
    }

    let execCount = 0;
    let execFn = "";
    let ticket = null;
    let noAlterNext = false;

    // ================= NEW FLOW GRAPH STRUCTURE =================
    // Mapa de nós e conexões para acesso O(1) e facilitar avanço passo-a-passo
    const flowGraph = {
      nodeMap: nodes.reduce((acc: Record<string, INodes>, n: INodes) => {
        acc[n.id] = n; return acc;
      }, {}),
      outMap: connects.reduce((acc: Record<string, IConnections[]>, c: IConnections) => {
        if (!acc[c.source]) acc[c.source] = [];
        acc[c.source].push(c);
        return acc;
      }, {})
    };
    // =============================================================

    for (let i = 0; i < lengthLoop; i++) {
      let nodeSelected: any;
      let ticketInit: Ticket;

      if (pressKey) {
        console.log("UPDATE2...");
        if (pressKey === "parar") {
          console.log("UPDATE3...");
          if (idTicket) {
            console.log("UPDATE4...");
            ticketInit = await Ticket.findOne({
              where: { id: idTicket, whatsappId }
            });
            await ticketInit.update({
              status: "closed"
            });
          }
          break;
        }

        if (execFn === "") {
          console.log("UPDATE5...");
          // Seleciona o nó atual com base em next (lastFlowId)
          nodeSelected = flowGraph.nodeMap[next];
          if (!nodeSelected) {
            console.log("UPDATE5a... Nó atual não encontrado para next:", next);
            break;
          }
        } else {
          console.log("UPDATE6...");
          nodeSelected = flowGraph.nodeMap[execFn];
        }
      } else {
        console.log("UPDATE7...");
        const otherNode = flowGraph.nodeMap[next];
        if (otherNode) {
          nodeSelected = otherNode;
        } else {
          console.log(`No node found for next: ${next}. Skipping to next iteration.`);
          const nextConnection = (flowGraph.outMap[next] || [])[0];
          if (nextConnection) {
            next = nextConnection.target;
          } else {
            next = nodes[i + 1]?.id || next;
          }
          continue;
        }
      }

      if (!nodeSelected) {
        console.log(`nodeSelected is undefined for next: ${next}. Skipping.`);
        continue;
      }

      console.log(`Processing node: ${nodeSelected.id} of type: ${nodeSelected.type}`);

      if (nodeSelected.type === "message") {
        let msg;
        const webhook = ticket?.dataWebhook;

        if (webhook && webhook.hasOwnProperty("variables")) {
          msg = {
            body: replaceMessages(webhook.variables, nodeSelected.data.label)
          };
        } else {
          msg = {
            body: nodeSelected.data.label
          };
        }

        await SendMessage(whatsapp, {
          number: numberClient,
          body: msg.body
        });
        await intervalWhats("1");
      }

      if (nodeSelected.type === "typebot") {
        const wbot = getWbot(whatsapp.id);
        await typebotListener({
          wbot: wbot,
          msg,
          ticket,
          typebot: nodeSelected.data.typebotIntegration
        });
      }

      if (nodeSelected.type === "openai" && nodeSelected.data?.typebotIntegration) {
        const {
          name,
          prompt,
          voice,
          voiceKey,
          voiceRegion,
          maxTokens,
          temperature,
          apiKey,
          queueId,
          maxMessages,
          model // ✅ novo campo
        } = nodeSelected.data.typebotIntegration as IOpenAi;
      
        const openAiSettings = {
          name,
          prompt,
          voice,
          voiceKey,
          voiceRegion,
          maxTokens: Number(maxTokens),
          temperature: Number(temperature),
          apiKey,
          queueId: Number(queueId),
          maxMessages: Number(maxMessages),
          model // ✅ incluso aqui também
        };
      
        const contact = await Contact.findOne({
          where: { number: numberClient, companyId }
        });
      
        const wbot = getWbot(whatsapp.id);
      
        const ticketTraking = await FindOrCreateATicketTrakingService({
          ticketId: ticket.id,
          companyId,
          userId: null,
          whatsappId: whatsapp?.id
        });
      
        await handleOpenAi(
          openAiSettings,
          msg,
          wbot,
          ticket,
          contact,
          null,
          ticketTraking
        );
      }
      

      if (nodeSelected.type === "question") {
        ticket = ticket || (await Ticket.findOne({ where: { id: idTicket, companyId } }));
        const webhook = ticket?.dataWebhook || {};
        const variables = webhook.variables || {};
        const { message, answerKey } = nodeSelected.data.typebotIntegration;
        
        // Verificar se esta pergunta específica já foi respondida
        if (!variables[answerKey]) {
          // Esta pergunta ainda não foi respondida, então a enviamos ao usuário
          const ticketDetails = await ShowTicketService(ticket.id, companyId);
          const bodyFila = formatBody(`${message}`, ticket.contact);
      
          await delay(3000);
          await typeSimulation(ticket, "composing");
          await SendWhatsAppMessage({ body: bodyFila, ticket: ticketDetails, quotedMsg: null });
          SetTicketMessagesAsRead(ticketDetails);
      
          await ticketDetails.update({ lastMessage: bodyFila });
      
          // Encontrar a próxima conexão, mas não avançar para ela ainda
          const nextConnection = connects.find(connect => connect.source === nodeSelected.id);
          const nextNodeId = nextConnection ? nextConnection.target : null;
      
          await ticket.update({
            userId: null,
            companyId,
            lastFlowId: nodeSelected.id,
            nextFlowId: nextNodeId,
            hashFlowId: hashWebhookId,
            flowStopped: idFlowDb.toString(),
            awaitingResponse: true // Marcando que estamos aguardando resposta
          });
          
          // Interromper o processamento aqui para aguardar a resposta do usuário
          break;
        } else {
          // Esta pergunta já foi respondida, podemos prosseguir para o próximo nó
          const nextConnection = connects.find(connect => connect.source === nodeSelected.id);
          if (nextConnection) {
            next = nextConnection.target;
            // Continuar o processamento para o próximo nó
          } else {
            break;
          }
        }
      }
      if (nodeSelected.type === "ticket") {
        const queueId = nodeSelected.data?.data?.id || nodeSelected.data?.id;
        const queue = await ShowQueueService(queueId, companyId);

        ticket = ticket || (await Ticket.findOne({ where: { id: idTicket, companyId } }));
        if (!ticket) {
          logger.error(`Ticket não encontrado para id: ${idTicket}`);
          continue;
        }

        await ticket.update({
          status: "pending",
          queueId: queue.id,
          userId: ticket.userId,
          companyId,
          flowWebhook: true,
          lastFlowId: nodeSelected.id,
          hashFlowId: hashWebhookId,
          flowStopped: idFlowDb.toString()
        });

        await FindOrCreateATicketTrakingService({
          ticketId: ticket.id,
          companyId,
          whatsappId: ticket.whatsappId,
          userId: ticket.userId
        });

        await UpdateTicketService({
          ticketData: { status: "pending", queueId: queue.id },
          ticketId: ticket.id,
          companyId
        });

        await CreateLogTicketService({ ticketId: ticket.id, type: "queue", queueId: queue.id });

        const settings = await CompaniesSettings.findOne({ where: { companyId } });
        const enableQueuePosition = settings?.sendQueuePosition === "enabled";

        if (enableQueuePosition) {
          const count = await Ticket.findAndCountAll({
            where: { userId: null, status: "pending", companyId, queueId: queue.id, whatsappId: whatsapp.id, isGroup: false }
          });
          const qtd = count.count === 0 ? 1 : count.count;
          const msgFila = `${settings.sendQueuePositionMessage} *${qtd}*`;
          const ticketDetails = await ShowTicketService(ticket.id, companyId);
          const bodyFila = formatBody(`${msgFila}`, ticket.contact);

          await delay(3000);
          await typeSimulation(ticket, "composing");
          await SendWhatsAppMessage({ body: bodyFila, ticket: ticketDetails, quotedMsg: null });
          SetTicketMessagesAsRead(ticketDetails);
          await ticketDetails.update({ lastMessage: bodyFila });
        }
      }

      if (nodeSelected.type === "singleBlock") {
        for (let iLoc = 0; iLoc < nodeSelected.data.seq.length; iLoc++) {
          const elementNowSelected = nodeSelected.data.seq[iLoc];

          ticket = await Ticket.findOne({
            where: { id: idTicket, companyId }
          });

          if (elementNowSelected.includes("message")) {
            const bodyFor = nodeSelected.data.elements.filter(
              item => item.number === elementNowSelected
            )[0].value;

            const ticketDetails = await ShowTicketService(idTicket, companyId);

            let msg;
            const webhook = ticket.dataWebhook;

            if (webhook && webhook.hasOwnProperty("variables")) {
              msg = replaceMessages(webhook.variables, bodyFor);
            } else {
              msg = bodyFor;
            }

            await delay(3000);
            await typeSimulation(ticket, "composing");

            await SendWhatsAppMessage({
              body: msg,
              ticket: ticketDetails,
              quotedMsg: null
            });

            SetTicketMessagesAsRead(ticketDetails);

            await ticketDetails.update({
              lastMessage: formatBody(bodyFor, ticket.contact)
            });

            await intervalWhats("1");
          }
          if (elementNowSelected.includes("interval")) {
            await intervalWhats(
              nodeSelected.data.elements.filter(
                item => item.number === elementNowSelected
              )[0].value
            );
          }

          const getBaseDir = (): string => {
            // Check if we're in development or production mode
            const isDev = process.env.NODE_ENV !== 'production';
            
            if (isDev) {
              // In development, return path without 'src'
              return path.resolve(__dirname, '..', '..').replace(/[\\\/]src$/, '');
            } else {
              // In production, the code is running from dist
              return path.resolve(__dirname, '..', '..', '..').replace(/[\\\/]src$/, '');
            }
          };
          
          // Helper function to correct paths
          const correctMediaPath = (pathToCorrect: string): string => {
            return pathToCorrect.replace(/[\\\/]src[\\\/]public/, '/public');
          };
          
          // Updated media path handling in the if blocks for img, audio, and video
          if (elementNowSelected.includes("img")) {
            await typeSimulation(ticket, "composing");
            // Correct path for images
            const mediaPath = path.join(
              getBaseDir(),
              "public",
              nodeSelected.data.elements.filter(
                item => item.number === elementNowSelected
              )[0].value
            );
            await SendMessage(whatsapp, {
              number: numberClient,
              body: "",
              mediaPath
            });
            await intervalWhats("1");
          }
          
          if (elementNowSelected.includes("audio")) {
            // Correct path for audio
            const mediaDirectory = path.join(
              getBaseDir(),
              "public",
              nodeSelected.data.elements.filter(
                item => item.number === elementNowSelected
              )[0].value
            );
            
            const ticketInt = await Ticket.findOne({
              where: { id: ticket.id }
            });
            await typeSimulation(ticket, "recording");
            await SendWhatsAppMediaFlow({
              media: mediaDirectory,
              ticket: ticketInt,
              isRecord: nodeSelected.data.elements.filter(
                item => item.number === elementNowSelected
              )[0].record
            });
            
            await intervalWhats("1");
          }
          
          if (elementNowSelected.includes("video")) {
            // Correct path for video
            const mediaDirectory = path.join(
              getBaseDir(),
              "public",
              nodeSelected.data.elements.filter(
                item => item.number === elementNowSelected
              )[0].value
            );
            
            const ticketInt = await Ticket.findOne({
              where: { id: ticket.id }
            });
            await typeSimulation(ticket, "recording");
            await SendWhatsAppMediaFlow({
              media: mediaDirectory,
              ticket: ticketInt
            });
            
            await intervalWhats("1");
          }
        }
      }

      let isRandomizer: boolean;
      if (nodeSelected.type === "randomizer") {
        const selectedRandom = randomizarCaminho(
          nodeSelected.data.percent / 100
        );

        const resultConnect = connects.filter(
          connect => connect.source === nodeSelected.id
        );
        if (selectedRandom === "A") {
          next = resultConnect.filter(item => item.sourceHandle === "a")[0]
            .target;
          noAlterNext = true;
        } else {
          next = resultConnect.filter(item => item.sourceHandle === "b")[0]
            .target;
          noAlterNext = true;
        }
        isRandomizer = true;
      }

      let isMenu: boolean;

      if (nodeSelected.type === "menu") {
        console.log(650, "menu - Processing menu node:", nodeSelected.id);
        if (pressKey) {
          console.log("Menu - Processing user input:", pressKey);
          
          const currentConnections = flowGraph.outMap[nodeSelected.id] || [];
          console.log("Menu - Available connections from current node:", currentConnections);
          
          const selectedConnection = currentConnections.filter(
            filt2 => filt2.sourceHandle === "a" + pressKey
          );
          console.log("Menu - Selected connection for option", pressKey, ":", selectedConnection);
          
          if (selectedConnection.length > 0) {
            execFn = selectedConnection[0].target;
            console.log("Menu - Next node selected:", execFn);
          } else {
            console.log("Menu - No connection found for option:", pressKey);
            execFn = undefined;
          }
          
          if (execFn === undefined) {
            console.log("Menu - Breaking execution - no valid connection");
            break;
          }
          
          pressKey = "999";

          const isNodeExist = flowGraph.nodeMap[execFn];
          console.log("Menu - Checking if next node exists:", !!isNodeExist);
          if (isNodeExist) {
            isMenu = isNodeExist.type === "menu" ? true : false;
            console.log("Menu - Next node is menu:", isMenu);
            // NEW: If the next node is also a menu, send it immediately (second menu issue fix)
            if (isMenu) {
              const nextMenuNode: any = isNodeExist;
              console.log("Menu - Immediate rendering of chained menu node:", nextMenuNode.id);
              try {
                let optionsMenu2 = "";
                nextMenuNode.data.arrayOption.forEach(item => {
                  optionsMenu2 += `[${item.number}] ${item.value}\n`;
                });

                const menuCreate2 = `${nextMenuNode.data.message}\n\n${optionsMenu2}`;

                const webhook2 = ticket?.dataWebhook;
                let msg2;
                if (webhook2 && webhook2.hasOwnProperty("variables")) {
                  msg2 = {
                    body: replaceMessages(webhook2, menuCreate2),
                    number: numberClient,
                    companyId: companyId
                  };
                } else {
                  msg2 = {
                    body: menuCreate2,
                    number: numberClient,
                    companyId: companyId
                  };
                }

                const ticketDetails2 = await ShowTicketService(ticket?.id ?? idTicket, companyId);
                await typeSimulation(ticketDetails2, "composing");
                await SendWhatsAppMessage({
                  body: msg2.body,
                  ticket: ticketDetails2,
                  quotedMsg: null
                });
                SetTicketMessagesAsRead(ticketDetails2);
                await ticketDetails2.update({
                  lastMessage: formatBody(msg2.body, ticketDetails2)
                });
                await intervalWhats("1");

                // Refresh ticket instance
                ticket = await Ticket.findOne({
                  where: { id: (ticket?.id ?? idTicket), whatsappId: whatsappId, companyId }
                });
                if (ticket) {
                  await ticket.update({
                    queueId: ticket.queueId ? ticket.queueId : null,
                    userId: null,
                    companyId: companyId,
                    flowWebhook: true,
                    isBot: true,
                    lastFlowId: nextMenuNode.id, // point to the new menu node
                    nextFlowId: nextMenuNode.id,
                    dataWebhook: dataWebhook,
                    hashFlowId: hashWebhookId,
                    flowStopped: idFlowDb.toString()
                  });
                }
                console.log("Menu - Second (chained) menu sent, waiting for user input");
              } catch (err) {
                console.log("Menu - Error sending chained menu:", err);
              }
              // Atualiza variável de avanço em memória
              next = isNodeExist.id;
              // Stop further processing to await the next user response for the chained menu
              break;
            }
          } else {
            isMenu = false;
          }
        } else {
          console.log("Menu - Sending menu options to user");
          let optionsMenu = "";
          nodeSelected.data.arrayOption.map(item => {
            optionsMenu += `[${item.number}] ${item.value}\n`;
          });

          const menuCreate = `${nodeSelected.data.message}\n\n${optionsMenu}`;

          const webhook = ticket.dataWebhook;

          let msg;
          if (webhook && webhook.hasOwnProperty("variables")) {
            msg = {
              body: replaceMessages(webhook, menuCreate),
              number: numberClient,
              companyId: companyId
            };
          } else {
            msg = {
              body: menuCreate,
              number: numberClient,
              companyId: companyId
            };
          }

          const ticketDetails = await ShowTicketService(ticket?.id ?? idTicket, companyId);

          const messageData: MessageData = {
            wid: randomString(50),
            ticketId: ticket.id,
            body: msg.body,
            fromMe: true,
            read: true
          };

          await typeSimulation(ticketDetails, "composing");

          await SendWhatsAppMessage({
            body: msg.body,
            ticket: ticketDetails,
            quotedMsg: null
          });

          SetTicketMessagesAsRead(ticketDetails);

          await ticketDetails.update({
            lastMessage: formatBody(msg.body, ticketDetails)
          });
          await intervalWhats("1");

          if (ticket) {
            ticket = await Ticket.findOne({
              where: {
                id: ticket.id,
                whatsappId: whatsappId,
                companyId: companyId
              }
            });
          } else {
            ticket = await Ticket.findOne({
              where: {
                id: idTicket,
                whatsappId: whatsappId,
                companyId: companyId
              }
            });
          }

          if (ticket) {
            await ticket.update({
              queueId: ticket.queueId ? ticket.queueId : null,
              userId: null,
              companyId: companyId,
              flowWebhook: true,
              isBot: true,
              lastFlowId: nodeSelected.id,
              nextFlowId: nodeSelected.id,
              dataWebhook: dataWebhook,
              hashFlowId: hashWebhookId,
              flowStopped: idFlowDb.toString()
            });
          }

          console.log("Menu - Ticket updated, breaking to wait for user response");
          break;
        }
      }

      let isContinue = false;

      if (pressKey === "999" && execCount > 0) {
        console.log("ActionsWebhookService - Menu option processed, continuing to next node");

        pressKey = undefined;
        let result = connects.filter(connect => connect.source === execFn)[0];
        if (typeof result === "undefined") {
          next = "";
          console.log("No connection found from executed node, ending flow");
        } else {
          if (!noAlterNext) {
            next = result.target;
            console.log("Moving to next node:", next);
          }
        }
      } else {
        let result;

        // Caso tenha sido pressionada uma opção e o próximo nó não seja menu,
        // seguir diretamente para o destino escolhido (execFn)
        if (pressKey === "999" && execFn && !isMenu) {
          result = { target: execFn } as any;
          isContinue = true;
          pressKey = undefined;
          console.log("Pressed key processed, jumping to chosen node:", execFn);
        } else if (isMenu) {
          result = { target: execFn };
          isContinue = true;
          pressKey = undefined;
          console.log("Menu node processed, continuing with:", execFn);
        } else if (isRandomizer) {
          isRandomizer = false;
          result = next;
          console.log("Randomizer node processed, continuing with:", next);
        } else {
          result = (flowGraph.outMap[nodeSelected.id] || [])[0];
          console.log("Standard node processed, next connection:", result);
        }

        if (typeof result === "undefined") {
          next = "";
          console.log("No next connection found, ending flow");
        } else {
          if (!noAlterNext) {
            next = result.target;
            console.log("Moving to next node:", next);
          }
        }
      }

      if (!pressKey && !isContinue) {
  const nextNode = (flowGraph.outMap[nodeSelected.id] || []).length;

        console.log("Checking for next connections from node:", nodeSelected.id, "found:", nextNode);

        if (nextNode === 0) {
          console.log("No next connections found - ending flow");

          await Ticket.findOne({
            where: { id: idTicket, whatsappId, companyId: companyId }
          });
          await ticket.update({
            lastFlowId: nodeSelected.id,
            hashFlowId: null,
            flowWebhook: false,
            flowStopped: idFlowDb.toString()
          });
          console.log("Flow completed - ticket updated");
          break;
        }
      }

      isContinue = false;

      if (next === "" || next === null) {
        if (i + 1 < nodes.length) {
          next = nodes[i + 1].id;
          console.log("No specific next node, using sequential:", next);
        } else {
          console.log("No more nodes available, ending flow");
          break;
        }
      }

      console.log("Node processing completed, continuing with next:", next);

      console.log("Updating ticket with current node state");
      ticket = await Ticket.findOne({
        where: { id: idTicket, whatsappId, companyId: companyId }
      });

      if (ticket && ticket.status === "closed") {
        console.log("Ticket is closed, notifying socket and ending flow");
        io.of(String(companyId))
          .emit(`company-${ticket.companyId}-ticket`, {
            action: "delete",
            ticketId: ticket.id
          });
      }

      console.log("Updating ticket state for next iteration");
      if (ticket) {
        await ticket.update({
          whatsappId: whatsappId,
          queueId: ticket?.queueId,
          userId: null,
          companyId: companyId,
          flowWebhook: true,
          lastFlowId: nodeSelected.id,
          nextFlowId: next, // Garante que o próximo nó seja salvo
          hashFlowId: hashWebhookId,
          flowStopped: idFlowDb.toString()
        });
        console.log("Ticket updated with next node:", next);
      }

      noAlterNext = false;
      execCount++;
    }

    return "ds";
  } catch (error) {
    logger.error(error);
    return "error";
  }
};

const constructJsonLine = (line: string, json: any) => {
  let valor = json;
  const chaves = line.split(".");

  if (chaves.length === 1) {
    return valor[chaves[0]];
  }

  for (const chave of chaves) {
    valor = valor[chave];
  }
  return valor;
};

function removerNaoLetrasNumeros(texto: string) {
  return texto.replace(/[^a-zA-Z0-9]/g, "");
}

const sendMessageWhats = async (
  whatsId: number,
  msg: any,
  req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>
) => {
  sendMessageFlow(whatsId, msg, req);
  return Promise.resolve();
};

const intervalWhats = (time: string) => {
  const seconds = parseInt(time) * 1000;
  return new Promise(resolve => setTimeout(resolve, seconds));
};

const replaceMessages = (variables, message) => {
  return message.replace(
    /{{\s*([^{}\s]+)\s*}}/g,
    (match, key) => variables[key] || ""
  );
};

const replaceMessagesOld = (
  message: string,
  details: any,
  dataWebhook: any,
  dataNoWebhook?: any
) => {
  const matches = message.match(/\{([^}]+)\}/g);

  if (dataWebhook) {
    let newTxt = message.replace(/{+nome}+/, dataNoWebhook.nome);
    newTxt = newTxt.replace(/{+numero}+/, dataNoWebhook.numero);
    newTxt = newTxt.replace(/{+email}+/, dataNoWebhook.email);
    return newTxt;
  }

  if (matches && matches.includes("inputs")) {
    const placeholders = matches.map(match => match.replace(/\{|\}/g, ""));
    let newText = message;
    placeholders.map(item => {
      const value = details["inputs"].find(
        itemLocal => itemLocal.keyValue === item
      );
      const lineToData = details["keysFull"].find(itemLocal =>
        itemLocal.endsWith(`.${value.data}`)
      );
      const createFieldJson = constructJsonLine(lineToData, dataWebhook);
      newText = newText.replace(`{${item}}`, createFieldJson);
    });
    return newText;
  } else {
    return message;
  }
};

