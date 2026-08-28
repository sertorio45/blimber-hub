export interface EmbeddedSignupResult {
  code: string
  wabaId: string | null
  phoneNumberId: string | null
  /** True when the customer onboarded an existing WhatsApp Business app number. */
  coexistence: boolean
}

interface SessionInfo {
  wabaId: string | null
  phoneNumberId: string | null
  coexistence: boolean
}

declare global {
  interface Window {
    FB?: any
    fbAsyncInit?: () => void
  }
}

const SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js'
const SDK_ELEMENT_ID = 'facebook-jssdk'

let sdkPromise: Promise<void> | null = null

/**
 * WhatsApp Embedded Signup v4.
 *
 * Two Meta channels have to be reconciled: the popup posts the selected asset ids
 * through `postMessage`, while the authorization code arrives on the `FB.login`
 * callback. They race, and on Coexistence the postMessage often omits the phone
 * number id, so the server treats these values as hints and rediscovers the rest.
 */
export function useMetaEmbeddedSignup() {
  const config = useRuntimeConfig()
  const appId = String(config.public.metaAppId || '')
  const configId = String(config.public.metaWhatsappConfigId || '')
  const graphVersion = String(config.public.metaGraphVersion || 'v21.0')

  const isAvailable = computed(() => Boolean(appId && configId))
  const loading = ref(false)

  function loadSdk(): Promise<void> {
    if (sdkPromise)
      return sdkPromise

    sdkPromise = new Promise<void>((resolve, reject) => {
      if (window.FB) {
        resolve()
        return
      }

      window.fbAsyncInit = () => {
        window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion })
        resolve()
      }

      const existing = document.getElementById(SDK_ELEMENT_ID)
      if (existing)
        return

      const script = document.createElement('script')
      script.id = SDK_ELEMENT_ID
      script.src = SDK_SRC
      script.async = true
      script.defer = true
      script.crossOrigin = 'anonymous'
      script.onerror = () => {
        sdkPromise = null
        reject(new Error('Não foi possível carregar o SDK da Meta'))
      }
      document.body.appendChild(script)
    })

    return sdkPromise
  }

  /**
   * Must be awaited before the user clicks: `FB.login` has to run synchronously
   * inside the click handler or the browser blocks the popup.
   */
  async function prepare(): Promise<void> {
    if (!isAvailable.value)
      return
    await loadSdk()
  }

  function launch(): Promise<EmbeddedSignupResult | null> {
    if (!window.FB)
      return Promise.reject(new Error('SDK da Meta ainda não carregou. Tente novamente.'))

    loading.value = true

    return new Promise<EmbeddedSignupResult | null>((resolve, reject) => {
      let session: SessionInfo = { wabaId: null, phoneNumberId: null, coexistence: false }
      let settled = false

      function cleanup() {
        window.removeEventListener('message', onMessage)
        loading.value = false
      }

      function onMessage(event: MessageEvent) {
        if (!event.origin.endsWith('facebook.com'))
          return

        let payload: any
        try {
          payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        }
        catch {
          return
        }

        if (payload?.type !== 'WA_EMBEDDED_SIGNUP')
          return

        const eventName = String(payload.event || '').toUpperCase()
        if (payload.data?.waba_id) {
          session = {
            wabaId: String(payload.data.waba_id),
            phoneNumberId: payload.data.phone_number_id ? String(payload.data.phone_number_id) : null,
            coexistence: eventName.includes('WHATSAPP_BUSINESS_APP_ONBOARDING'),
          }
        }
      }

      window.addEventListener('message', onMessage)

      window.FB.login(
        (response: any) => {
          if (settled)
            return
          settled = true

          const code = response?.authResponse?.code
          cleanup()

          if (!code) {
            // Covers cancellation, blocked popup and documented Embedded Signup errors.
            resolve(null)
            return
          }

          resolve({ code, ...session })
        },
        {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: {},
            // Surfaces the Coexistence branch; without it only new-number onboarding shows.
            featureType: 'whatsapp_business_app_onboarding',
          },
        },
      )

      // FB.login never calls back when the popup is killed by the browser.
      setTimeout(() => {
        if (settled)
          return
        settled = true
        cleanup()
        reject(new Error('O popup da Meta não respondeu. Verifique o bloqueador de pop-ups.'))
      }, 5 * 60 * 1000)
    })
  }

  return { isAvailable, loading, prepare, launch }
}
