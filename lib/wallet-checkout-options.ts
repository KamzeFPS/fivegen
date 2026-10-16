import type {StripeCheckoutExpressCheckoutElementOptions} from '@stripe/stripe-js';

export const walletOnlyOptions:StripeCheckoutExpressCheckoutElementOptions={
  paymentMethods:{applePay:'auto',googlePay:'auto',link:'never',amazonPay:'never',paypal:'never',klarna:'never'},
  paymentMethodOrder:['apple_pay','google_pay'],buttonHeight:52,
  buttonType:{applePay:'buy',googlePay:'buy'},
  buttonTheme:{applePay:'white',googlePay:'white'},
  // Stripe requires unlimited rows when the overflow menu is disabled.
  layout:{maxColumns:1,maxRows:0,overflow:'never'},
};
