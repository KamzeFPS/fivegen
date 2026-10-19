import type {StripeCheckoutExpressCheckoutElementOptions,StripeCheckoutPaymentElementOptions} from '@stripe/stripe-js';

export const expressCheckoutOptions:StripeCheckoutExpressCheckoutElementOptions={
  paymentMethods:{applePay:'always',googlePay:'auto',link:'auto',amazonPay:'never',paypal:'never',klarna:'never'},
  paymentMethodOrder:['link','apple_pay','google_pay'],
  buttonHeight:52,
  buttonTheme:{applePay:'white',googlePay:'white'},
  buttonType:{applePay:'buy',googlePay:'buy'},
  layout:{maxColumns:1,maxRows:0,overflow:'never'},
};

export const cardCheckoutOptions:StripeCheckoutPaymentElementOptions={
  layout:'tabs',
  paymentMethodOrder:['card'],
  wallets:{applePay:'never',googlePay:'never',link:'never'},
};
