import { GoogleGenAI, Type } from "@google/genai";
import { GenerationResult } from "../types";

export async function generateWordPressPlugin(prompt: string, customKey?: string, model: string = "gemini-1.5-flash"): Promise<GenerationResult> {
  // Safely access the API key from custom input or environment
  let apiKey = "";
  if (customKey && customKey.trim() !== "") {
    apiKey = customKey.trim();
  } else if (typeof process !== 'undefined' && process.env.GEMINI_API_KEY) {
    apiKey = process.env.GEMINI_API_KEY.trim();
  }

  // Validate the key before initializing the SDK
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "undefined" || apiKey === "") {
    throw new Error("Gemini API Key is missing. Please go to the 'Config' tab and paste your API Key from https://aistudio.google.com/app/apikey");
  }

  // Correct initialization as per guidelines
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: `Generate a complete WordPress plugin based on this request: ${prompt}. 
      The output must be a JSON object containing the plugin name, a brief description, and an array of files with their paths and full content.
      Ensure the main plugin file has the correct WordPress headers.
      Include a readme.txt file following WordPress standards.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            pluginName: { type: Type.STRING },
            description: { type: Type.STRING },
            files: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  path: { type: Type.STRING, description: "Relative path of the file, e.g., 'my-plugin/my-plugin.php'" },
                  content: { type: Type.STRING, description: "Full content of the file" }
                },
                required: ["path", "content"]
              }
            }
          },
          required: ["pluginName", "description", "files"]
        }
      }
    });

    const text = response.text;

    if (!text) {
      throw new Error("The AI returned an empty response. Please try a more detailed prompt.");
    }

    try {
      return JSON.parse(text.trim()) as GenerationResult;
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError, "Raw text:", text);
      throw new Error("The AI generated an invalid JSON response. Please try again.");
    }
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    
    const errorMsg = error.message || "";
    
    // Handle specific SDK and API errors
    if (errorMsg.includes("API Key must be set") || errorMsg.includes("API_KEY_INVALID")) {
      throw new Error("Invalid or missing API Key. Please re-enter it in the 'Config' tab.");
    }

    if (errorMsg.includes("PERMISSION_DENIED") || errorMsg.includes("403")) {
      throw new Error(`Permission Denied (403): ${error.message}`);
    }
    
    if (errorMsg.includes("quota") || errorMsg.includes("429")) {
      throw new Error("API Quota exceeded (429). Please wait a minute and try again.");
    }

    throw new Error(`AI Generation failed: ${error.message || "Unknown error"}`);
  }
}
