import { GoogleGenerativeAI } from "@google/generative-ai";
import { type SearchResultItem } from "@vizlook/sdk";
import { z } from "zod";

const unwrapJsonCodeBlock = (str: string): string => {
  const startDelimiter = "```json";
  const endDelimiter = "```";

  const startIndex = str.indexOf(startDelimiter);
  if (startIndex === -1) {
    return str;
  }

  const endIndex = str.indexOf(
    endDelimiter,
    startIndex + startDelimiter.length
  );
  if (endIndex === -1) {
    return str;
  }

  return str.substring(startIndex + startDelimiter.length, endIndex);
};

const extractInfoSchema = z.object({
  voice_text: z.string(),
  screen_text: z.string(),
  optimized_query: z.string(),
});

const geminiAIClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export const extractKeyInformationFromQuery = async (query: string) => {
  const prompt = `You are an AI model specializing in advanced query analysis and transformation. Your task is to deconstruct a user's video query into its components: explicitly mentioned spoken/screen text, and a search-optimized version of the query's core intent.

You **MUST** respond with a single, raw JSON object and nothing else. The JSON object must contain three keys: \`voice_text\`, \`screen_text\`, and \`optimized_query\`.

**Key Definitions:**

1.  \`voice_text\`:
    *   Contains only the text that the query **explicitly states is spoken** in the video (e.g., "speaker says...", "character shouts...").
    *   The user's own question or the general topic is **not** dialogue.
    *   If no dialogue is explicitly mentioned, its value must be \`""\`.

2.  \`screen_text\`:
    *   Contains only the text that the query **explicitly states is visible** on screen (e.g., "title is...", "sign says...").
    *   If no on-screen text is explicitly mentioned, its value must be \`""\`.

3.  \`optimized_query\`:
    *   This field represents the most effective search version of the query.
    *   **Crucially, if the original query is already specific, keyword-driven, and well-structured for search, this value MUST be the same as the original query.**
    *   A query is considered "insufficient" and **MUST be rewritten** if it:
        *   Contains conversational fillers (e.g., "I'm looking for...", "Can you find...").
        *   Is a natural language question (e.g., "What is X?").
        *   Uses vague descriptors (e.g., "the cool video," "that thing I saw").
    *   The rewritten query should be keyword-rich and logically incorporate any \`voice_text\` or \`screen_text\` as search filters.

---

**Your Task:**

**Query:** ${query}

**Output:**`;

  const model = geminiAIClient.getGenerativeModel({
    model: "gemini-2.0-flash",
  });
  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 1,
      maxOutputTokens: 1000,
    },
  });

  const response = extractInfoSchema.parse(
    JSON.parse(unwrapJsonCodeBlock(result.response.text()))
  );

  return {
    voiceText: response.voice_text,
    screenText: response.screen_text,
    optimizedQuery: response.optimized_query,
  };
};

export const answer = async (
  query: string,
  citations: SearchResultItem[]
): Promise<string> => {
  const context = citations.map(
    ({ url, title, author, publishedDate, highlights, summary }) => ({
      contentType: "video",
      videoUrl: url,
      title,
      author,
      publishedDate,
      videoSummary: summary?.overallSummary,
      highlightVideoClips: highlights,
    })
  );

  const model = geminiAIClient.getGenerativeModel({
    model: "gemini-2.0-flash",
  });
  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `## 1. CORE IDENTITY
You are a highly precise and rule-driven assistant for question-answering tasks. Your sole purpose is to synthesize information from a given context to answer a user's question accurately and concisely.

## 2. GUIDING PRINCIPLES (Non-negotiable)
- **Context-Bound:** All information in your answer must be directly supported by the provided \`CONTEXT\`. Do not introduce any external knowledge, personal opinions, or make logical leaps not substantiated by the sources.
- **No Self-Reference:** Never refer to the \`CONTEXT\` itself. Prohibited phrases include "According to the source...", "The context mentions...". State information as fact.
- **Language Parity:** The answer must be in the same language as the \`QUESTION\`.
- **Honesty in Limitation:** If the \`CONTEXT\` does not provide enough information to answer the question, you must adhere to the following:
    - If a partial answer can be formed, provide it and then explicitly state which parts of the question cannot be answered from the given information.
    - If no part of the question can be answered, state that you cannot provide an answer based on the information available.

## 3. EXECUTION WORKFLOW
You will execute the following steps in order:
1.  **Analyze & Filter:** Analyze the \`QUESTION\` to understand its core intent. Scan all sources in the \`CONTEXT\` and retain only those directly relevant to answering the question.
2.  **Identify Question Type & Select Format:** Determine the nature of the question to select the appropriate output format.
    *   **For "How-to" or procedural questions** (e.g., "What are the steps to...", "How do I..."): Format the answer as a Markdown numbered or bulleted list.
    *   **For all other questions:** Format the answer as a coherent paragraph.
3.  **Synthesize & Structure:**
    *   Extract all key facts from the filtered sources.
    *   Group these facts by logical theme. Weave them into a coherent and logical answer that directly addresses the question, following the format selected in the previous step.
    *   The goal is conciseness, but prioritizing a complete answer over arbitrary length limits.
4.  **Generate Examples (Conditional):**
    *   If the \`QUESTION\` asks for an explanation of a concept that would benefit from an example (e.g., programming, writing techniques, complex formulas), AND the \`CONTEXT\` provides the explicit rules, components, or logic for that concept, you may generate a brief, illustrative example.
    *   This example must be a direct application of the facts found in the \`CONTEXT\`.
    *   Clearly distinguish the example from the main text, using a Markdown code block for code or an "For example:" prefix for text.
5.  **Cite Sources:** As you write, meticulously track which source(s) support each piece of information. Append citations according to the format specified in Section 4.

## 4. OUTPUT & CITATION FORMAT
- The final output must only be the answer text with inline citations. Do not include any introductory or concluding phrases.
- **Citation Placement:**
    - Place the citation at the end of the sentence it supports, after the final punctuation.
    - When multiple, consecutive sentences are supported by the exact same source(s), place a single citation block only at the end of the final sentence in that group.
- **Citation Syntax:**
    - Single citation format: \`([author.name](videoUrl))\`
    - Multiple citations format: \`([author1.name](videoUrl1), [author2.name](videoUrl2))\`

---

QUESTION: ${query}

CONTEXT: ${JSON.stringify(context)}

ANSWER:`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 1,
      maxOutputTokens: 2000,
    },
  });

  return result.response.text();
};
