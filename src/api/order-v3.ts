// add retries and timeouts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setTimeout } from 'timers/promises'
import { decodeJWT } from '../auth'
import {
  fulfillmentService,
  inventoryService,
  paymentService,
} from '../services'

async function retry<Result>(
  serviceCall: () => Promise<Result>,
  maxAttempts = 10,
  callTimeout = 30 * 1000,
  initialInterval = 1000
): Promise<Result> {
  let result: Result | undefined
  let error: any
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      result = await Promise.race([
        serviceCall(),
        setTimeout(callTimeout, undefined),
      ])
      const timedOut = result === undefined
      if (timedOut) {
        throw new Error('Timed out')
      }
      break
    } catch (e) {
      error = e
      await setTimeout(initialInterval * Math.pow(2, attempt))
    }
  }
  if (!result) {
    throw error
  }
  return result
}

export default async (request: VercelRequest, response: VercelResponse) => {
  const { itemId, quantity, addressId } = request.body
  const { userId } = decodeJWT(request.headers.authorization)

  const reservation = await retry(() =>
    inventoryService.reserve({ itemId, quantity })
  )
  if (reservation.failed) {
    response.status(400).send(`Don't have enough inventory`)
    return
  }

  const payment = await retry(() =>
    paymentService.charge({ userId, itemId, quantity })
  )
  if (payment.failed) {
    await inventoryService.unreserve({ itemId, quantity })
    response.status(400).send(`Payment failed`)
    return
  }

  const fulfillment = await retry(() =>
    fulfillmentService.sendPackage({
      itemId,
      quantity,
      addressId,
    })
  )
  if (fulfillment.failed) {
    await paymentService.refund({ userId, itemId, quantity })
    await inventoryService.unreserve({ itemId, quantity })
    response.status(400).send(`Can't ship to your address`)
    return
  }

  response.status(200).send(`Order submitted!`)
}

// next: idempotency
