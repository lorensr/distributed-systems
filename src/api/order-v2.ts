// add failure compensation
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { decodeJWT } from '../auth'
import { fulfillmentService, inventoryService, paymentService } from '../services'

export default async (request: VercelRequest, response: VercelResponse) => {
  const { itemId, quantity, addressId } = request.body
  const { userId } = decodeJWT(request.headers.authorization)

  const reservation = await inventoryService.reserve({ itemId, quantity })
  if (reservation.failed) {
    response.status(400).send(`Don't have enough inventory`)
    return
  }

  const payment = await paymentService.charge({ userId, itemId, quantity })
  if (payment.failed) {
    await inventoryService.unreserve({ itemId, quantity })
    response.status(400).send(`Payment failed`)
    return
  }

  const fulfillment = await fulfillmentService.sendPackage({
    itemId,
    quantity,
    addressId,
  })
  if (fulfillment.failed) {
    await paymentService.refund({ userId, itemId, quantity })
    await inventoryService.unreserve({ itemId, quantity })
    response.status(400).send(`Can't ship to your address`)
    return
  }

  response.status(200).send(`Order submitted!`)
}

// next: add retries and timeouts
