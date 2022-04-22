import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'

const { reserve, unreserve, charge, refund, sendPackage } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
})

export async function processOrder(order: activities.Order): Promise<void> {
  await reserve(order)

  try {
    await charge(order)
  } catch (e) {
    await unreserve(order)
    throw e
  }

  try {
    await sendPackage(order)
  } catch (e) {
    await unreserve(order)
    await refund(order)
    throw e
  }
}
