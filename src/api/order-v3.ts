// add retries and timeouts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { decodeJWT } from '../auth'
import { fulfillmentService, inventoryService, paymentService } from '../services'

async function retry<Result>(
  serviceCall: () => Promise<Result>,
  maxAttempts = 10,
  callTimeout = 30 * 1000,
  initialInterval = 1000
): Promise<Result> {
  let result: Result | undefined
  let error: any
  let attempt = 0
  while (attempt < maxAttempts) {
    try {
      result = await Promise.race([
        serviceCall(),
        new Promise<undefined>((resolve) => setTimeout(resolve, callTimeout, undefined)),
      ])
      const timedOut = result === undefined
      if (timedOut) {
        throw new Error('Timed out')
      }
      break
    } catch (e) {
      error = e
      await new Promise((resolve) => setTimeout(resolve, initialInterval * Math.pow(2, attempt++)))
    }
  }
  if (error) {
    throw error
  }
  if (!result) {
    throw new Error('Reached max attempts')
  }
  return result
}

export default async (request: VercelRequest, response: VercelResponse) => {
  const { itemId, quantity, addressId } = request.body
  const { userId } = decodeJWT(request.headers.authorization)

  const reservation = await retry(() => inventoryService.reserve({ itemId, quantity }))
  if (reservation.failed) {
    response.status(400).send(`Don't have enough inventory`)
    return
  }

  const payment = await retry(() => paymentService.charge({ userId, itemId, quantity }))
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
    await inventoryService.unreserve({ itemId, quantity })
    await paymentService.refund({ userId, itemId, quantity })
    response.status(400).send(`Can't ship to your address`)
    return
  }

  response.status(200).send(`Order submitted!`)
}

// next: idempotency
