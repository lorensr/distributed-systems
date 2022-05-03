// use Temporal
import {
  WorkflowClient,
  WorkflowExecutionAlreadyStartedError,
} from '@temporalio/client'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { decodeJWT } from '../auth'
import { processOrder } from '../workflows'

const client = new WorkflowClient()

export default async (request: VercelRequest, response: VercelResponse) => {
  const { itemId, quantity, addressId, requestId } = request.body
  const { userId } = decodeJWT(request.headers.authorization)

  try {
    await client.start(processOrder, {
      args: [{ itemId, quantity, addressId, userId }], // type inference works!
      workflowId: requestId,
      taskQueue: 'my-online-store',
    })
    response.status(200).send(`Order submitted!`)
  } catch (e: any) {
    if (e instanceof WorkflowExecutionAlreadyStartedError) {
      response.status(400).send(`Order already submitted`)
    } else {
      response
        .status(500)
        .send(
          `Unknown error. Please try again later. Error message: ${e?.message}`
        )
    }
  }
}
