import type {Metadata} from 'next';
import {requireAdmin} from '@/lib/admin';
import {BillingReadiness} from './readiness';
import '../../pricing/pricing.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Payment readiness — FiveGen'};
export default async function AdminBillingPage(){await requireAdmin();return <BillingReadiness/>;}
