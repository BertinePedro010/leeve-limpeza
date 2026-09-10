-- Purely additive: one new value on the existing "PaymentMethod" enum.
-- Nothing is dropped or renamed. Existing service_orders.payment_method_new
-- and transactions.payment_method rows keep their current values; both
-- columns stay nullable. "boleto" only becomes selectable in the OS payment
-- dropdown (see components/ui.tsx paymentMethodOptions) and accepted by the
-- API (see lib/validators.ts paymentMethodEnum). Financial logic is untouched.
ALTER TYPE "PaymentMethod" ADD VALUE 'boleto';
