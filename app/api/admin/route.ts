import {requireAdmin} from "@/lib/admin";
import {database,failure} from "@/lib/server";
export async function GET(){try{
  await requireAdmin();const db=database();
  const [fees,credits,subscriptions,budget,accounts]=await Promise.all([
    db.prepare("SELECT COALESCE(SUM(platform_fee),0) n FROM orders").first(),
    db.prepare("SELECT COALESCE(SUM(amount),0) n FROM credit_purchases WHERE state='paid'").first(),
    db.prepare("SELECT COALESCE(SUM(amount),0) n FROM platform_receipts").first(),
    db.prepare("SELECT reserved_micros n FROM ai_budget WHERE day=?").bind(new Date().toISOString().slice(0,10)).first(),
    db.prepare("SELECT COUNT(*) n FROM wallets").first(),
  ]);
  return Response.json({fees:Number(fees?.n||0),creditSales:Number(credits?.n||0),subscriptions:Number(subscriptions?.n||0),todayBudgetUsed:Number(budget?.n||0)/1e6,accounts:Number(accounts?.n||0)});
}catch(e){return failure(e);}}
