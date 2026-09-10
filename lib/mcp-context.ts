import { AsyncLocalStorage } from "node:async_hooks";
import type { ChatGPTUser } from "@/app/chatgpt-auth";

// Set only after bearer-token verification, scoped to one MCP tool invocation.
export const mcpIdentity = new AsyncLocalStorage<ChatGPTUser>();
export const mcpCreditLimit = new AsyncLocalStorage<{remaining:number}>();
