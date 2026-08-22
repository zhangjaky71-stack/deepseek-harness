import { useEffect } from 'react'

const DEFAULT_CLIENT_TITLE = 'DeepSeek Harness'

/** Props for the browser title projection. */
export interface DocumentTitleProps {
  /** Durable title of the selected session, or undefined for the product title. */
  title?: string
}

/** Project the selected session title into the browser title. */
export function DocumentTitle({ title }: DocumentTitleProps): null {
  const productTitle = process.env.DSH_CLIENT_TITLE ?? DEFAULT_CLIENT_TITLE
  useEffect(() => {
    document.title = title === undefined ? productTitle : `${title} — ${productTitle}`
    return () => { document.title = productTitle }
  }, [productTitle, title])
  return null
}
