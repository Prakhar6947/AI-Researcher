import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  retrievedContext: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  searchType: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "internal",
  }),
  // FIX: Added the missing Critic fields to the state type definition
  isContextValid: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => true,
  }),
  retryCount: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  })
});