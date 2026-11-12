// Loads Razorpay Checkout on demand (only on the pricing page) and resolves
// with the payment response, or rejects when the learner closes the window.
const SRC = 'https://checkout.razorpay.com/v1/checkout.js'
let loading = null

function loadCheckout() {
  if (window.Razorpay) return Promise.resolve()
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { loading = null; reject(new Error("Couldn't load the payment window. Check your connection and try again.")) }
    document.head.appendChild(s)
  })
  return loading
}

export async function openCheckout({ key_id, subscription_id, prefill, plan }) {
  await loadCheckout()
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: key_id,
      subscription_id,
      name: 'SceneScribe',
      description: `SceneScribe Pro · ${plan === 'yearly' ? 'yearly' : 'monthly'}`,
      prefill,
      theme: { color: '#e8ff47' },
      handler: (response) => resolve(response),
      modal: { ondismiss: () => reject(Object.assign(new Error('Payment cancelled'), { code: 'DISMISSED' })) },
    })
    rzp.on('payment.failed', (r) => reject(new Error(r?.error?.description || 'Payment failed. You were not charged.')))
    rzp.open()
  })
}
