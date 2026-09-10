import {ApiError,binding,identity} from "./server";
import type {ChatGPTUser} from "@/app/chatgpt-auth";
export function isAdmin(user:ChatGPTUser){
  const ids=binding("ADMIN_USER_IDS").split(",").map(v=>v.trim()).filter(Boolean);
  const emails=binding("ADMIN_EMAILS").toLowerCase().split(",").map(v=>v.trim()).filter(Boolean);
  return ids.includes(user.userId)||emails.includes(user.email.toLowerCase());
}
export async function requireAdmin(){const u=await identity();if(!isAdmin(u))throw new ApiError("Only the FiveGen administrator can manage platform AI.",403);return u;}
