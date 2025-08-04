import * as Yup from "yup";
import AppError from "../../errors/AppError";
import Prompt from "../../models/Prompt";
import ShowPromptService from "./ShowPromptService";

interface PromptData {
    name: string;
    apiKey: string;
    prompt: string;
    maxTokens?: number;
    temperature?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    queueId?: number;
    maxMessages?: number;
    companyId: string | number;
    voice?: string;
    voiceKey?: string;
    voiceRegion?: string;
    model?: string;
}

const CreatePromptService = async (promptData: PromptData): Promise<Prompt> => {
    const { name, apiKey, prompt, queueId,maxMessages,companyId } = promptData;

    const promptSchema = Yup.object().shape({
        name: Yup.string().required("ERR_PROMPT_NAME_INVALID"),
        prompt: Yup.string().required("ERR_PROMPT_INTELLIGENCE_INVALID"),
        apiKey: Yup.string().required("ERR_PROMPT_APIKEY_INVALID"),
        queueId: Yup.number().required("ERR_PROMPT_QUEUEID_INVALID"),
        maxMessages: Yup.number().required("ERR_PROMPT_MAX_MESSAGES_INVALID"),
        companyId: Yup.number().required("ERR_PROMPT_companyId_INVALID")
    });

    try {
        await promptSchema.validate({ name, apiKey, prompt, queueId,maxMessages,companyId });
    } catch (err) {
        throw new AppError(`${JSON.stringify(err, undefined, 2)}`);
    }

    // Define valores padrão para campos de voz se não fornecidos
    const promptDataWithDefaults = {
        ...promptData,
        voice: promptData.voice || "pt-BR",
        voiceKey: promptData.voiceKey || "",
        voiceRegion: promptData.voiceRegion || "brazil",
        model: promptData.model || "gpt-3.5-turbo-1106"
    };

    let promptTable = await Prompt.create(promptDataWithDefaults);
    promptTable = await ShowPromptService({ promptId: promptTable.id, companyId });

    return promptTable;
};

export default CreatePromptService;
