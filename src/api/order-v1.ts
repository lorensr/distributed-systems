import type { VercelRequest, VercelResponse } from '@vercel/node'
import { decodeJWT } from '../auth'
import { fulfillmentService, inventoryService, paymentService } from '../services'

export default async (request: VercelRequest, response: VercelResponse) => {
  const { itemId, quantity, addressId } = request.body
  const { userId } = decodeJWT(request.headers.authorization)

  await inventoryService.reserve({ itemId, quantity })
  await paymentService.charge({ userId, itemId, quantity })
  await fulfillmentService.sendPackage({ itemId, quantity, addressId })

  response.status(200).send(`Order submitted!`)
}
