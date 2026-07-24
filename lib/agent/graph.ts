import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "./state";
import { SystemMessage } from "@langchain/core/messages";
import { vectorStore } from "./store";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

// FIX: Removed baseUrl override to stop the TypeError, updated model
const llm = new ChatGoogleGenerativeAI({ 
    model: process.env.GOOGLE_MODEL ?? "gemini-3.6-flash",
    temperature: 0
});


const routerNode = async (state: typeof AgentState.State) => {
  // In a real app, you'd use the LLM to analyze the query.
  // Here, we use a simple heuristic: if the user asks for "news", search the web.
  const lastMessage = state.messages[state.messages.length - 1].content.toString().toLowerCase();
  const searchType = lastMessage.includes("news") ? "web" : "internal";
  return { searchType };
};

const retrieverNode = async (state: typeof AgentState.State) => {
  console.log("--- REAL VECTOR DATABASE SEARCH ---");
  const question = state.messages[state.messages.length - 1].content.toString();
  
  // Perform a similarity search against the uploaded documents
  const results = await vectorStore.similaritySearch(question, 3); // Pull top 3 chunks
  
  const context = results.length > 0 
    ? results.map(r => r.pageContent).join("\n\n---\n\n")
    : "No relevant internal documents found in the vector store.";
    
  return { retrievedContext: `Document Context:\n${context}` };
};

const webSearchNode = async () => {
  // Mocking a slow external Web API search
  await new Promise(resolve => setTimeout(resolve, 1500));
  return { retrievedContext: "Live Web Search: Recent tech news indicates AI startups are seeing a 40% increase in funding." };
};

// ... Keep your existing imports, llm initialization, routerNode, retrieverNode, and webSearchNode ...

// NEW: The Critic Node evaluates the retrieved context
const criticNode = async (state: typeof AgentState.State) => {
  console.log("--- CRITIC EVALUATING CONTEXT ---");
  const question = state.messages[0].content; 
  const context = state.retrievedContext;

  // Ask the LLM to grade the relevance of the retrieved data
  const prompt = `You are an expert evaluator. 
  Question: ${question}
  Retrieved Context: ${context}
  
  Does the context contain sufficient and relevant information to answer the question accurately?
  Respond with exactly YES or NO.`;

  const response = await llm.invoke(prompt);
  const answer = response.content.toString().trim().toUpperCase();
  const isValid = answer.includes("YES");

  return {
    isContextValid: isValid,
    retryCount: state.retryCount + 1,
    // If internal search failed, force the next loop to use web search
    searchType: isValid ? state.searchType : "web" 
  };
};

// UPGRADED: The Deep Synthesis Generator Node
const generatorNode = async (state: typeof AgentState.State) => {
  console.log("--- GENERATING SYNTHESIS REPORT ---");
  const context = state.retrievedContext;
  const userMessage = state.messages[state.messages.length - 1];
  
  const systemPrompt = `You are an expert academic research synthesizer. 
  Your task is to answer the user's query using ONLY the provided context.
  
  You MUST format your response as a professional research report using Markdown.
  Include the following sections:
  
  # Executive Summary
  (1-2 sentences summarizing the core answer)
  
  ## Key Findings
  (Bullet points detailing specific data, metrics, or mechanisms found in the text)
  
  ## Detailed Analysis
  (A deeper paragraph explaining the concepts)
  
  If the context does not contain the answer, state that clearly rather than guessing.
  
  CONTEXT:
  ${context}`;

  const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      userMessage
  ]);
  
  return { messages: [response] };
}

// 3. Define the Routing Logic
const routeDecision = (state: typeof AgentState.State) => {
  return state.searchType === "web" ? "webSearch" : "retriever";
};

// NEW: Routing logic for the Critic
const criticDecision = (state: typeof AgentState.State) => {
  if (state.isContextValid) {
    return "generator"; // Context is good, generate the final answer
  }
  if (state.retryCount >= 2) {
    return "generator"; // Prevent infinite loops; force answer generation
  }
  return "webSearch"; // Context is bad, loop back and search the live web
};

// 4. Compile the Graph
export const compiledGraph = new StateGraph(AgentState)
  .addNode("router", routerNode)
  .addNode("retriever", retrieverNode)
  .addNode("webSearch", webSearchNode)
  .addNode("critic", criticNode) // Add the critic node
  .addNode("generator", generatorNode)
  
  .addEdge(START, "router")
  .addConditionalEdges("router", routeDecision, {
    retriever: "retriever",
    webSearch: "webSearch"
  })
  // Point retrieval nodes to the Critic instead of the Generator
  .addEdge("retriever", "critic")
  .addEdge("webSearch", "critic")
  // Critic decides if it loops back or moves forward
  .addConditionalEdges("critic", criticDecision, {
    generator: "generator",
    webSearch: "webSearch"
  })
  .addEdge("generator", END)
  .compile();
