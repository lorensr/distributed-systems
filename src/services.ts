export const inventoryService = {
  reserve: async (_: any): Promise<ReservationResult> => ({ failed: true }),
  unreserve: async (_: any): Promise<ReservationResult> => ({ failed: true }),
}

export const paymentService = {
  charge: async (_: any): Promise<PaymentResult> => ({ failed: true }),
  refund: async (_: any): Promise<PaymentResult> => ({ failed: true }),
}

export const fulfillmentService = {
  sendPackage: async (_: any): Promise<FulfillmentResult> => ({ failed: true }),
}

export type ReservationResult = {
  failed: boolean
}

export type PaymentResult = {
  failed: boolean
}

export type FulfillmentResult = {
  failed: boolean
}
