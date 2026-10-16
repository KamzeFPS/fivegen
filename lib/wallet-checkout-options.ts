import type {StripeCheckoutPaymentElementOptions} from '@stripe/stripe-js';

export const cardCheckoutOptions:StripeCheckoutPaymentElementOptions={
  layout:'tabs',
  paymentMethodOrder:['card'],
  wallets:{applePay:'never',googlePay:'never',link:'never'},
};
