import type { Metadata } from 'next';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { paddleAccount } from '@/lib/paddle/account';
import { BillingAccount } from './billing-account';
import '../../pricing/pricing.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Billing & receipts — FiveGen' };
export default async function BillingPage() {
  const user = await requireChatGPTUser('/account/billing');
  return <BillingAccount email={user.email} account={await paddleAccount(user.userId)} />;
}
