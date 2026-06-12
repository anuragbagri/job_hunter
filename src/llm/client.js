import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { config } from "../config/index.js";

export function createChatModel({ temperature = 0 } = {}) {
  switch (config.LLM_PROVIDER) {
    case "gemini":
      return new ChatGoogleGenerativeAI({
        apiKey: config.GEMINI_API_KEY,
        model: config.GEMINI_MODEL,
        temperature
      });
    case "openai":
    default:
      return new ChatOpenAI({
        apiKey: config.OPENAI_API_KEY,
        model: config.OPENAI_MODEL,
        temperature
      });
  }
}
