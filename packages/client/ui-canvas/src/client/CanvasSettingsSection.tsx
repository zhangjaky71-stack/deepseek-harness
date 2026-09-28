/** Canvas deployment-feature settings section. Writes persist for the next Host activation. */

import type { ReactNode } from 'react'
import type {
  CanvasFeatureConfig,
  CanvasFeatureName,
} from '@deepseek-ai/dsh-canvas/client'
import type {
  SettingsScope,
  SettingsScopeSnapshot,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { CanvasKey } from './locales.ts'
import styles from './CanvasSettingsSection.module.css'

const FEATURES: readonly CanvasFeatureName[] = [
  'canvas', 'editor', 'history', 'video', 'variants', 'partialRun', 'regionEdit', 'providerFallback',
]

/** Apply-owned dependencies; the `hooks` compartment is framework-bound to `useSettings`. */
export interface CanvasSettingsSectionInjected {
  hooks: { settings: SettingsScope<CanvasFeatureConfig> }
  setFeature(feature: CanvasFeatureName, enabled: boolean): void
  resetFeature(feature: CanvasFeatureName): void
}

export type CanvasSettingsSectionProps = InjectFace<CanvasSettingsSectionInjected> & {
  t: (key: CanvasKey) => string
}

function userSection(snapshot: SettingsScopeSnapshot<CanvasFeatureConfig>): Record<string, unknown> | undefined {
  return snapshot.user !== null && typeof snapshot.user === 'object' && !Array.isArray(snapshot.user)
    ? snapshot.user as Record<string, unknown>
    : undefined
}

function enabledOf(value: CanvasFeatureConfig | undefined, feature: CanvasFeatureName): boolean {
  return value?.[feature]?.enabled === true
}

/** Render the settings surface without owning settings state or subscriptions. */
export function CanvasSettingsSection(props: CanvasSettingsSectionProps): ReactNode {
  const snapshot = props.useSettings(state => state)
  const t = props.t

  if (snapshot.status === 'loading') {
    return <div className={styles['section']}><p className={styles['notice']}>{t('settings.loading')}</p></div>
  }
  if (snapshot.status === 'unavailable' || snapshot.value === undefined) {
    return (
      <div className={styles['section']}>
        <h2 className={styles['title']}>{t('settings.title')}</h2>
        <p className={styles['notice']}>{t('settings.unavailable')}</p>
      </div>
    )
  }

  const user = userSection(snapshot)
  return (
    <div className={styles['section']}>
      <header className={styles['header']}>
        <div>
          <h2 className={styles['title']}>{t('settings.title')}</h2>
          <p className={styles['intro']}>{t('settings.intro')}</p>
        </div>
        <span className={styles['restartBadge']}>{t('settings.restartBadge')}</span>
      </header>
      <p className={styles['restartNotice']} role="note">{t('settings.restartNotice')}</p>
      {!snapshot.writable ? <p className={styles['notice']}>{t('settings.readOnly')}</p> : null}
      <div className={styles['features']}>
        {FEATURES.map((feature) => {
          const overridden = Object.hasOwn(user ?? {}, feature)
          const checked = enabledOf(snapshot.value, feature)
          return (
            <section className={styles['featureRow']} key={feature}>
              <div className={styles['featureCopy']}>
                <label className={styles['featureLabel']} htmlFor={`canvas-feature-${feature}`}>
                  {t(`settings.feature.${feature}.title` as CanvasKey)}
                </label>
                <p>{t(`settings.feature.${feature}.body` as CanvasKey)}</p>
                <small>{overridden ? t('settings.overridden') : t('settings.inherited')}</small>
              </div>
              <div className={styles['controls']}>
                {overridden ? (
                  <button
                    type="button"
                    className={styles['resetButton']}
                    disabled={!snapshot.writable}
                    onClick={() => { props.resetFeature(feature) }}
                  >
                    {t('settings.reset')}
                  </button>
                ) : null}
                <input
                  id={`canvas-feature-${feature}`}
                  className={styles['toggle']}
                  type="checkbox"
                  checked={checked}
                  disabled={!snapshot.writable}
                  aria-label={t(`settings.feature.${feature}.title` as CanvasKey)}
                  onChange={(event) => { props.setFeature(feature, event.currentTarget.checked) }}
                />
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}