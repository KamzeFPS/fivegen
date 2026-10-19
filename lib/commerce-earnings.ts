/** Amounts are Stripe minor units, never frontend estimates. Sale and settlement
 * currencies are separate because Stripe can convert a buyer's payment. */
export type CommerceEarningsOrder = {
  id: string;
  productId: string;
  title: string;
  amount: number;
  currency: string;
  status: string;
  feeStatus: 'confirmed' | 'pending' | 'legacy' | 'refunded';
  expectedFeeBps: number;
  expectedFeeAmount: number;
  actualChargePlatformFeeAmount: number | null;
  settlementAmount: number | null;
  settlementCurrency: string | null;
  stripeFeeAmount: number | null;
  platformFeeAmount: number | null;
  creatorNetAmount: number | null;
  availability: string;
  availableAt: number | null;
  paidAt: number | null;
  createdAt: number;
};

export type CommerceEarningsReport = {
  commissionPercent: 5;
  /** All paid sales in the buyer's payment currency. */
  sales: { currency: string; grossAmount: number; orders: number }[];
  /** Only verified paid settlements, in the Stripe balance currency. These
   * amounts are earnings after fees, not proof a bank payout has happened. */
  totals: {
    currency: string;
    grossAmount: number;
    stripeFeeAmount: number;
    platformFeeAmount: number;
    creatorNetAmount: number;
    confirmedOrders: number;
  }[];
  coverage: {
    totalOrders: number;
    confirmedOrders: number;
    pendingOrders: number;
    legacyOrders: number;
    excludedOrders: number;
  };
  orders: CommerceEarningsOrder[];
  orderLimit: number;
};

export type CommerceEarningsRefresh = { refreshed: number; pending: number; failed: number; limit: number };
