import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'
import { Order } from './types'

const { reserve, unreserve, charge, refund, sendPackage } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '1 minute',
})

export async function processOrder(order: Order): Promise<void> {
  await reserve(order)

  try {
    await charge(order)
    try {
      await sendPackage(order)
    } catch (e) {
      await refund(order)
      throw e
    }
  } catch (e) {
    await unreserve(order)
    throw e
  }
}
