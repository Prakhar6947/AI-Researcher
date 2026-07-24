# 🧠 Autonomous Research Agent (Agentic CRAG Pipeline)

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-Stateful_AI-0052FF?style=flat)
![Google Gemini](https://img.shields.io/badge/Google_Gemini-API-4285F4?style=flat&logo=google)
![Status](https://img.shields.io/badge/Status-Active_Development-success)

A robust, multi-agent **Retrieval-Augmented Generation (RAG)** system built to automate deep research and document synthesis. Engineered with Next.js and LangGraph, this project moves beyond standard linear RAG pipelines by implementing a **Corrective RAG (CRAG)** architecture. 

Instead of blindly generating answers from retrieved text, this stateful agent evaluates its own findings, rejects irrelevant context, and dynamically reroutes its search strategy to strictly mitigate LLM hallucinations.

---

## 🎯 The Problem It Solves

Standard RAG systems suffer from a critical flaw: if the vector database returns poor or irrelevant context, the LLM will still attempt to generate an answer, often leading to hallucinations. 

**This project solves this by introducing a self-reflective "Critic" node.** The system acts as a deterministic state machine that grades the fidelity of its own retrieval before it is allowed to synthesize a final report.

## ✨ Advanced Features

* **Stateful Agent Orchestration (LangGraph):** Utilizes a cyclic graph architecture to manage conversation state, retry counts, and conditional edge routing, allowing the agent to "think" in loops rather than a straight line.
* **LLM-as-a-Judge (Critic Node):** Implements an autonomous evaluation step where the model grades the semantic relevance of retrieved PDF chunks against the user's query. If graded "NO", the agent refuses to answer and triggers a fallback search.
* **Custom Native Embeddings:** Bypasses legacy open-source library bottlenecks by utilizing a custom `Embeddings` class written directly against the modern `@google/genai` SDK, ensuring high-throughput, error-free vectorization.
* **Real-Time Execution Streaming:** Leverages Server-Sent Events (SSE) via the Next.js App Router to stream the agent's internal node transitions and state updates directly to the client UI.
* **Intelligent Document Processing:** Features overlapping `RecursiveCharacterTextSplitter` logic to maintain semantic boundaries during PDF and TXT chunking.

---

## 🏗️ System Architecture

### The Agentic Graph Flow

```text
                      [ User Input ]
                            │
                            ▼
                    ┌───────────────┐
                    │  Router Node  │──(Intent: Live News)──┐
                    └───────────────┘                       │
                            │                               │
                     (Intent: Research)                     │
                            │                               │
                            ▼                               ▼
                    ┌───────────────┐               ┌───────────────┐
                    │   Retriever   │               │   Web Search  │
                    │ (Vector DB)   │               │  (Fallback)   │
                    └───────────────┘               └───────────────┘
                            │                               │
                            └──────────────┬────────────────┘
                                           │
                                           ▼
                                ┌─────────────────────┐
                                │     Critic Node     │
                                │ (Evaluates Context) │
                                └─────────────────────┘
                                           │
                        ┌──────────────────┴──────────────────┐
                        │                                     │
                   (Score: NO)                           (Score: YES)
             (Triggers Web Fallback)                          │
                        │                                     ▼
                        │                          ┌─────────────────────┐
                        └──────────────────────────│   Generator Node    │
                                                   │ (Markdown Synthesis)│
                                                   └─────────────────────┘