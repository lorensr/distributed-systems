import { Context } from '@temporalio/activity'
import {
  FulfillmentResult,
  fulfillmentService,
  inventoryService,
  PaymentResult,
  paymentService,
  ReservationResult,
} from './services'

export type Order = {
  itemId: string
  quantity: number
  addressId: string
  userId: string
}

const getRequestId = () => Context.current().info.workflowExecution.workflowId

export async function reserve(order: Order): Promise<ReservationResult> {
  return inventoryService.reserve({ ...order, requestId: getRequestId() })
}
export async function unreserve(order: Order): Promise<ReservationResult> {
  return inventoryService.unreserve({ ...order, requestId: getRequestId() })
}

export async function charge(order: Order): Promise<PaymentResult> {
  return paymentService.charge({ ...order, requestId: getRequestId() })
}
export async function refund(order: Order): Promise<PaymentResult> {
  return paymentService.refund({ ...order, requestId: getRequestId() })
}

export async function sendPackage(order: Order): Promise<FulfillmentResult> {
  return fulfillmentService.sendPackage({ ...order, requestId: getRequestId() })
}
