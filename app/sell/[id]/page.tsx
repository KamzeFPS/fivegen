import { notFound } from 'next/navigation';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { fileSalesEnabled } from '@/lib/file-sales';
import FileSaleStudio from '@/app/file-sale-studio';

export const dynamic = 'force-dynamic';

export default async function SellProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!fileSalesEnabled()) notFound();
  await requireChatGPTUser(`/sell/${encodeURIComponent(id)}`);
  return <FileSaleStudio initialId={id} />;
}
