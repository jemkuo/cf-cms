import app from '../src/app'
import type { Env } from '../src/types'

export const onRequest: PagesFunction<Env> = (context) => {
  return app.fetch(context.request, context.env, context as unknown as ExecutionContext)
}
