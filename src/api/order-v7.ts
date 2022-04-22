// save state
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { MongoClient } from 'mongodb'
import { decodeJWT } from '../auth'
import { fulfillmentService, inventoryService, paymentService } from '../services'

const mongo = new MongoClient(`mongodb://localhost`)

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

enum OrderState {
  CREATED,
  RESERVED,
  FAILED_TO_RESERVE,
  PAID,
  FAILED_TO_CHARGE,
  FAILED_TO_CHARGE_UNRESERVED,
  FULFILLED,
  FAILED_TO_FULFILL,
  FAILED_TO_FULFILL_UNRESERVED,
  FAILED_TO_FULFILL_REFUNDED,
}

export default async (request: VercelRequest, response: VercelResponse) => {
  const { itemId, quantity, addressId, requestId } = request.body
  const { userId } = decodeJWT(request.headers.authorization)

  try {
    await mongo.connect()
    const db = mongo.db('orders')
    const orders = db.collection('orders')
    const result = await orders.insertOne({
      itemId,
      quantity,
      addressId,
      requestId,
      userId,
      state: STATES.CREATED,
    })
    if (!result.acknowledged) {
      response.status(500).send('Failed to initiate order')
      return
    }
    const _id = result.insertedId

    let error: any
    const reservation = await retry(() => inventoryService.reserve({ itemId, quantity, requestId })).catch((e) => {
      error = e
    })
    if (!reservation || reservation.failed) {
      await orders.updateOne({ _id }, { $set: { state: STATES.FAILED_TO_RESERVE } })
      response.status(400).send(reservation ? `Don't have enough inventory` : error.message)
      return
    }
    await orders.updateOne({ _id }, { $set: { state: STATES.RESERVED } })

    const payment = await retry(() => paymentService.charge({ userId, itemId, quantity, requestId })).catch((e) => {
      error = e
    })
    if (!payment || payment.failed) {
      await orders.updateOne({ _id }, { $set: { state: STATES.FAILED_TO_CHARGE } })
      await retry(() => inventoryService.unreserve({ itemId, quantity, requestId }))
      await orders.updateOne({ _id }, { $set: { state: STATES.FAILED_TO_CHARGE_UNRESERVED } })
      response.status(400).send(payment ? `Payment failed` : error.message)
      return
    }
    await orders.updateOne({ _id }, { $set: { state: STATES.PAID } })

    const fulfillment = await retry(() =>
      fulfillmentService.sendPackage({
        itemId,
        quantity,
        addressId,
        requestId,
      })
    ).catch((e) => {
      error = e
    })
    if (!fulfillment || fulfillment.failed) {
      await orders.updateOne({ _id }, { $set: { state: STATES.FAILED_TO_FULFILL } })
      await retry(() => inventoryService.unreserve({ itemId, quantity, requestId }))
      await orders.updateOne({ _id }, { $set: { state: STATES.FAILED_TO_FULFILL_UNRESERVED } })
      await retry(() => paymentService.refund({ userId, itemId, quantity, requestId }))
      await orders.updateOne({ _id }, { $set: { state: STATES.FAILED_TO_FULFILL_REFUNDED } })
      response.status(400).send(fulfillment ? `Can't ship to your address` : error.message)
      return
    }
    await orders.updateOne({ _id }, { $set: { state: STATES.FULFILLED } })

    response.status(200).send(`Order submitted!`)
  } catch (e: any) {
    response.status(500).send(`Internal server error: ${e?.message}`)
  } finally {
    await mongo.close()
  }
}

// next: db retries & error handling, worker: updatedAt. returning earlier.
