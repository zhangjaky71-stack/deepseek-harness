import { useEffect } from 'react'

const DEFAULT_CLIENT_TITLE = 'DeepSeek Harness'

/** Props for the browser title projection. */
export interface DocumentTitleProps {
  /** Durable title of the selected session, or undefined for the product title. */
  title?: string
}

/**
 * Project the selected session title into the browser title.
 * @param props - Selected-session title projection input.
 * @returns No rendered node; this component updates `document.title` by effect.
 */
export function DocumentTitle(props: DocumentTitleProps): null {
  const { title } = props
  const productTitle = process.env.DSH_CLIENT_TITLE ?? DEFAULT_CLIENT_TITLE
  useEffect(() => {
    document.title = title === undefined ? productTitle : `${title} — ${productTitle}`
    return () => { document.title = productTitle }
  }, [productTitle, title])
  return null
}
